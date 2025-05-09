"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import * as faceapi from "face-api.js";

// Replace with your Supabase URL and Key
const supabase = createClient(yourSupabaseUrl, yourSupabaseAnonKey);

// const supabase = createClient(
//   "https://simbwfrefchsfqlxvxhq.supabase.co",
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbWJ3ZnJlZmNoc2ZxbHh2eGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3Mjc4ODIsImV4cCI6MjA2MjMwMzg4Mn0.0tjn1Q4ZE5a_Utq5u8O0vCM7rKu3UNkKxbpMsqCIJFI"
// );

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load face-api.js models
  const loadModels = async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
  };

  // Handle image upload
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file: File | null = e.target.files ? e.target.files[0] : null;
    if (file) {
      setImage(URL.createObjectURL(file));
      await verifyFace(file);
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

      setTimeout(() => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          stream.getTracks().forEach((track) => track.stop());
        } else {
          console.error("Failed to get canvas context");
          setResult("Error processing image");
        }

        canvas.toBlob(async (blob) => {
          if (blob) {
            setImage(URL.createObjectURL(blob));
            await verifyFace(blob);
          } else {
            console.error("Failed to create blob from canvas");
            setResult("Error processing image");
          }
        });
      }, 1000);
    } catch (error) {
      console.error("Camera error:", error);
      setResult("Error accessing camera");
    }
  };

  // Verify face against database
  interface FaceDescriptor {
    descriptor: number[];
  }

  const verifyFace = async (file: File | Blob): Promise<void> => {
    setIsLoading(true);
    setResult(null);

    try {
      await loadModels();

      // Process uploaded/captured image
      const img = await faceapi.bufferToImage(file);
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setResult("No face detected");
        setIsLoading(false);
        return;
      }

      const uploadedDescriptor = detection.descriptor;

      // Fetch stored face descriptors from Supabase
      const { data: storedFaces, error } = await supabase
        .from<FaceDescriptor>("faces")
        .select("descriptor");

      if (error) {
        console.error("Supabase error:", error);
        setResult("Error checking database");
        setIsLoading(false);
        return;
      }

      // Compare with stored descriptors
      const maxDistance = 0.6; // Threshold for face matching
      let matchFound = false;

      for (const face of storedFaces || []) {
        const storedDescriptor = new Float32Array(
          Object.values(face.descriptor)
        );
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

      // Optionally store new face
      if (!matchFound) {
        await supabase
          .from("faces")
          .insert([{ descriptor: uploadedDescriptor }]);
      }
    } catch (error) {
      console.error("Verification error:", error);
      setResult("Error processing image");
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
          className="bg-blue-500 text-white px-4 py-2 rounded"
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
          className="max-w-xs mb-4"
        />
      )}

      {isLoading && <p>Processing...</p>}
      {result && <p className="text-lg">{result}</p>}
    </div>
  );
}
