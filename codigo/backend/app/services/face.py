import base64
import io
import numpy as np
from PIL import Image
import face_recognition

DETECT_MAX_WIDTH = 400


def decode_base64_image(foto_base64: str) -> Image.Image:
    if ',' in foto_base64:
        foto_base64 = foto_base64.split(',', 1)[1]
    image_data = base64.b64decode(foto_base64)
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    return image


def resize_for_detection(image: Image.Image) -> tuple[np.ndarray, float]:
    w, h = image.size
    if w <= DETECT_MAX_WIDTH:
        return np.array(image), 1.0
    scale = DETECT_MAX_WIDTH / w
    new_size = (DETECT_MAX_WIDTH, int(h * scale))
    resized = image.resize(new_size, Image.BILINEAR)
    return np.array(resized), scale


def get_all_faces(foto_base64: str) -> list[tuple[list[float], dict]]:
    image = decode_base64_image(foto_base64)
    w, h = image.size
    small_array, scale = resize_for_detection(image)

    face_locations = face_recognition.face_locations(small_array)

    if len(face_locations) == 0:
        raise ValueError('No se detecto ningun rostro en la imagen')

    if scale < 1.0:
        inv = 1.0 / scale
        face_locations_full = [
            (int(top * inv), int(right * inv), int(bottom * inv), int(left * inv))
            for (top, right, bottom, left) in face_locations
        ]
        full_array = np.array(image)
        encodings = face_recognition.face_encodings(full_array, face_locations_full)
        locations_for_box = face_locations_full
    else:
        encodings = face_recognition.face_encodings(small_array, face_locations)
        locations_for_box = face_locations

    results = []
    for encoding, (top, right, bottom, left) in zip(encodings, locations_for_box):
        face_box = {'top': top / h, 'right': right / w, 'bottom': bottom / h, 'left': left / w}
        results.append((encoding.tolist(), face_box))

    return results


def get_face_embedding(foto_base64: str) -> list[float]:
    faces = get_all_faces(foto_base64)
    if len(faces) > 1:
        raise ValueError('Se detectaron multiples rostros. Envia una foto con exactamente 1 rostro')
    return faces[0][0]


def compare_embeddings(
    unknown_embedding: list[float], known_embeddings: list[list[float]], tolerance: float = 0.5
) -> tuple[int | None, float | None]:
    if not known_embeddings:
        return None, None

    unknown = np.array(unknown_embedding)
    known = np.array(known_embeddings)

    distances = np.linalg.norm(known - unknown, axis=1)
    min_index = int(np.argmin(distances))
    min_distance = float(distances[min_index])

    if min_distance <= tolerance:
        return min_index, min_distance
    return None, None
