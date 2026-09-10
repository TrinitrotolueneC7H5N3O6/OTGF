import json
import os
import sys

import whisper


model = whisper.load_model(os.environ.get("WHISPER_LOCAL_MODEL", "base"))
print(json.dumps({"type": "ready"}), flush=True)

for line in sys.stdin:
    try:
        request = json.loads(line)
        result = model.transcribe(
            request["path"],
            language=request.get("language") or None,
            fp16=False,
            verbose=False,
            condition_on_previous_text=False,
        )
        print(
            json.dumps(
                {
                    "type": "result",
                    "id": request["id"],
                    "text": result.get("text", "").strip(),
                }
            ),
            flush=True,
        )
    except Exception as error:
        print(
            json.dumps(
                {
                    "type": "result",
                    "id": request.get("id") if "request" in locals() else None,
                    "error": str(error),
                }
            ),
            flush=True,
        )
