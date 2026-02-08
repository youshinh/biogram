import os
from google import genai

API_KEY = os.environ.get("GEMINI_API_KEY")


def list_models():
    if not API_KEY:
        print("Error: GEMINI_API_KEY not set.")
        return

    client = genai.Client(api_key=API_KEY)
    print("Listing available models...")
    try:
        for m in client.models.list():
            print(f"Name: {m.name}")
            print(f"Supported Actions: {m.supported_actions}\n")
    except Exception as e:
        print(f"Error listing models: {e}")


if __name__ == "__main__":
    list_models()
