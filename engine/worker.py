import json, sys, traceback
from core import decode, ocr, identify, InputError


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(12 * 1024 * 1024))
        im = decode(request.get("image", ""))
        operation = request.get("operation")
        if operation == "ocr":
            result = ocr(im, request.get("language"))
        elif operation == "identify":
            result = identify(im, request.get("text", ""), request.get("lineCount", 0))
        else:
            raise InputError("Operación no disponible.")
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    except InputError as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
    except Exception:
        traceback.print_exc(file=sys.stderr)
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "El análisis no ha podido completarse. Prueba un recorte más limpio.",
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
