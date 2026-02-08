import os
import wave
import math
import struct
import json
import base64
import time
import io
from google import genai
from google.genai import types

# Configuration
API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = "gemini-flash-lite-latest"


def generate_dummy_audio_bytes(duration=5.0, sample_rate=44100):
    """Generates a sine wave audio in-memory as bytes (WAV format)."""
    n_samples = int(sample_rate * duration)
    buffer = io.BytesIO()

    with wave.open(buffer, "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for i in range(n_samples):
            t = i / sample_rate
            # Frequency sweep from 220Hz to 880Hz to simulate "buildup"
            freq = 220 + (660 * (i / n_samples))
            value = int(32767.0 * math.sin(2 * math.pi * freq * t) * 0.5)
            data = struct.pack("<h", value)
            wav_file.writeframes(data)

    buffer.seek(0)
    return buffer.read()


def generate_dummy_audio(filename, duration=5.0):
    """Generates a 5-second sine wave audio file with varying frequency."""
    print(f"Generating dummy audio: {filename}...")
    audio_bytes = generate_dummy_audio_bytes(duration)
    with open(filename, "wb") as f:
        f.write(audio_bytes)
    print("Audio generated.")


def _send_to_gemini(audio_data, mime_type="audio/wav"):
    """Internal helper to send audio data to Gemini."""
    if not API_KEY:
        raise ValueError("GEMINI_API_KEY environment variable not set.")

    client = genai.Client(api_key=API_KEY)

    # Prompt Design
    prompt = """
    Analyze this audio chunk (part of a continuous DJ mix) for real-time visual visualization.
    Generate a JSON object containing a time-series analysis.
    
    Structure:
    {
      "bpm": number (estimate),
      "mood": string (e.g., "Energetic", "Dark", "Ethereal"),
      "timeline": [
        {
          "time": number (seconds from start of chunk),
          "energy": number (0.0-1.0),
          "brightness": number (0.0-1.0),
          "event": string ("NONE" | "KICK" | "SNARE" | "BUILD" | "DROP" | "BREAK")
        },
        ...
      ]
    }
    
    Output data roughly every 0.1 seconds.
    """

    print(f"Sending request to {MODEL_NAME}...")
    start_time = time.time()

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[
            types.Content(
                parts=[
                    types.Part.from_bytes(data=audio_data, mime_type=mime_type),
                    types.Part.from_text(text=prompt),
                ]
            )
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    end_time = time.time()
    print(f"Analysis complete in {end_time - start_time:.2f} seconds.")

    try:
        return json.loads(response.text)
    except json.JSONDecodeError:
        print("Error: Response is not valid JSON.")
        print("Raw response:", response.text)
        return None


def analyze_audio_chunk(pcm_data, sample_rate=44100, chunk_id="debug"):
    """
    Analyzes a raw PCM byte chunk.
     Wraps PCM data in a WAV container in-memory before sending to Gemini.
    """
    print(f"Analyzing Chunk: {chunk_id} (Size: {len(pcm_data)} bytes)")

    # Wrap raw PCM in WAV container
    buffer = io.BytesIO()
    with wave.open(buffer, "w") as wav_file:
        wav_file.setnchannels(1)  # Assumption: Mono for analysis
        wav_file.setsampwidth(2)  # Assumption: 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

    buffer.seek(0)
    wav_bytes = buffer.read()

    return _send_to_gemini(wav_bytes, mime_type="audio/wav")


def analyze_audio(filename):
    """Uploads audio file to Gemini and requests JSON analysis."""
    print(f"Reading audio file: {filename}...")
    with open(filename, "rb") as f:
        audio_data = f.read()

    result = _send_to_gemini(audio_data, mime_type="audio/wav")

    if result:
        print("--- Analysis Result (JSON) ---")
        print(json.dumps(result, indent=2))

        # Validation check
        timeline = result.get("timeline", [])
        print(f"\nTimeline length: {len(timeline)} points")


if __name__ == "__main__":
    # Test Mode
    audio_file = "test_audio.wav"
    generate_dummy_audio(audio_file)
    analyze_audio(audio_file)
