"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import * as faceapi from "face-api.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load face-api.js models
  const loadModels = async () => {
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      console.log("Models loaded successfully");
    } catch (err) {
      console.error("Model loading error:", err);
      throw new Error("Failed to load face recognition models");
    }
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      setImage(URL.createObjectURL(file));
      await verifyFace(file);
    } else {
      setError("No file selected");
    }
  };

  // Handle camera capture
  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.play();

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      setTimeout(() => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach((track) => track.stop());

        canvas.toBlob(
          async (blob) => {
            if (blob) {
              setImage(URL.createObjectURL(blob));
              await verifyFace(blob);
            } else {
              throw new Error("Failed to create blob from canvas");
            }
          },
          "image/jpeg",
          0.9
        );
      }, 1000);
    } catch (error) {
      console.error("Camera error:", error);
      setError("Error accessing camera: " + (error as Error).message);
    }
  };

  // Verify face against database
  interface FaceDescriptor {
    descriptor: number[];
  }

  const verifyFace = async (file: File | Blob) => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      // Load models
      await loadModels();

      // Process uploaded/captured image
      const img = await faceapi.bufferToImage(file);
      if (!img) {
        throw new Error("Failed to load image");
      }

      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setResult("No face detected in the image");
        setIsLoading(false);
        return;
      }

      const uploadedDescriptor = detection.descriptor;

      // Fetch stored face descriptors from Supabase
      const { data: storedFaces, error: dbError } = await supabase
        .from<FaceDescriptor>("faces")
        .select("descriptor");

      if (dbError) {
        console.error("Supabase error:", dbError);
        throw new Error("Error fetching data from database");
      }

      // Compare with stored descriptors
      const maxDistance = 0.6; // Threshold for face matching
      let matchFound = false;

      for (const face of storedFaces || []) {
        const storedDescriptor = new Float32Array(face.descriptor);
        const distance = faceapi.euclideanDistance(
          uploadedDescriptor,
          storedDescriptor
        );

        if (distance < maxDistance) {
          matchFound = true;
          break;
        }
      }

      setResult(matchFound ? "Face match found!" : "No match found");

      // Store new face if no match found
      if (!matchFound) {
        const { error: insertError } = await supabase
          .from("faces")
          .insert([{ descriptor: Array.from(uploadedDescriptor) }]);

        if (insertError) {
          console.error("Insert error:", insertError);
          setError("Failed to store new face");
        }
      }
    } catch (error) {
      console.error("Verification error:", error);
      setError(`Error processing image: ${(error as Error).message}`);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Face Recognition App</h1>

      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="mb-2"
        />
        <button
          onClick={handleCameraCapture}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Capture from Camera
        </button>
      </div>

      {image && (
        <Image
          src={image}
          alt="Uploaded"
          width={320}
          height={240}
          className="max-w-xs mb-4 rounded"
          priority
        />
      )}

      {isLoading && <p className="text-gray-600">Processing...</p>}
      {result && <p className="text-lg text-green-600">{result}</p>}
      {error && <p className="text-lg text-red-600">{error}</p>}
    </div>
  );
}
