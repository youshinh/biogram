import sys
import os
import io
import analyze

# Ensure we can import from current directory
sys.path.append(os.getcwd())


def test_chunk_analysis():
    print("Testing analyze_audio_chunk...")

    # Generate 1 second of dummy audio
    audio_bytes = analyze.generate_dummy_audio_bytes(duration=1.0)
    print(f"Generated {len(audio_bytes)} bytes of audio data.")

    # Analyze
    result = analyze.analyze_audio_chunk(audio_bytes, chunk_id="TEST_001")

    if result:
        print("SUCCESS: Received JSON response")
        print(result)

        # Basic Validation
        if "bpm" in result and "timeline" in result:
            print("VALIDATION PASSED: Keys found.")
        else:
            print("VALIDATION FAILED: Missing keys.")
    else:
        print("FAILURE: No result returned.")


if __name__ == "__main__":
    test_chunk_analysis()
