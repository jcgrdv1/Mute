import * as faceapi from 'face-api.js';

let modelsLoaded = false;
export const FACE_TOLERANCE = 0.5;

export async function loadModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
  ]);
  modelsLoaded = true;
}

const canvas1 = document.createElement('canvas');
let ctx1 = null;
const canvas2 = document.createElement('canvas');
let ctx2 = null;

function getCtx(canvas, ref, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext('2d', { willReadFrequently: true });
  }
  return ref || canvas.getContext('2d', { willReadFrequently: true });
}

export async function detectBoxes(video) {
  const vw = video.videoWidth,
    vh = video.videoHeight;
  if (!vw || !vh) return [];
  const s = Math.min(1, 480 / vw);
  const w = Math.round(vw * s),
    h = Math.round(vh * s);
  ctx1 = getCtx(canvas1, ctx1, w, h);
  ctx1.drawImage(video, 0, 0, w, h);

  const dets = await faceapi.detectAllFaces(
    canvas1,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }),
  );

  return dets.map((d) => ({
    box: {
      top: d.box.top / h,
      right: (d.box.left + d.box.width) / w,
      bottom: (d.box.top + d.box.height) / h,
      left: d.box.left / w,
    },
    score: d.score,
  }));
}

export async function detectAndIdentify(video) {
  const vw = video.videoWidth,
    vh = video.videoHeight;
  if (!vw || !vh) return [];
  const s = Math.min(1, 480 / vw);
  const w = Math.round(vw * s),
    h = Math.round(vh * s);
  ctx2 = getCtx(canvas2, ctx2, w, h);
  ctx2.drawImage(video, 0, 0, w, h);

  const dets = await faceapi
    .detectAllFaces(
      canvas2,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptors();

  return dets.map((d) => ({
    descriptor: Array.from(d.descriptor),
    box: {
      top: d.detection.box.top / h,
      right: (d.detection.box.left + d.detection.box.width) / w,
      bottom: (d.detection.box.top + d.detection.box.height) / h,
      left: d.detection.box.left / w,
    },
    score: d.detection.score,
  }));
}

export async function descriptorFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const d = await faceapi
          .detectSingleFace(
            img,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }),
          )
          .withFaceLandmarks()
          .withFaceDescriptor();
        resolve(d ? Array.from(d.descriptor) : null);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => resolve(null);
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

export function buildDescriptorMatrix(descs) {
  if (!descs.length) return null;
  const m = new Float64Array(descs.length * 128);
  for (let i = 0; i < descs.length; i++)
    for (let j = 0; j < 128; j++) m[i * 128 + j] = descs[i][j];
  return m;
}

export function matchFace(descriptor, matrix, count, tolerance = FACE_TOLERANCE) {
  if (!matrix || count === 0) return null;
  let bi = -1,
    bd = Infinity;
  for (let i = 0; i < count; i++) {
    let s = 0;
    const o = i * 128;
    for (let j = 0; j < 128; j++) {
      const d = descriptor[j] - matrix[o + j];
      s += d * d;
    }
    if (s < bd) {
      bd = s;
      bi = i;
    }
  }
  bd = Math.sqrt(bd);
  return bd <= tolerance ? { index: bi, distance: bd } : null;
}

export function matchAllFaces(faces, users, matrix, tolerance = FACE_TOLERANCE) {
  const uw = users.filter((u) => u.localDescriptor);
  return faces.map((f) => {
    const m = matchFace(f.descriptor, matrix, uw.length, tolerance);
    return m
      ? { box: f.box, match: true, user: uw[m.index], distance: m.distance }
      : { box: f.box, match: false };
  });
}

export function findBestMatch(d, kd, t = FACE_TOLERANCE) {
  if (!kd.length) return null;
  let bi = -1,
    bd = Infinity;
  for (let i = 0; i < kd.length; i++) {
    let s = 0;
    for (let j = 0; j < 128; j++) {
      const x = d[j] - kd[i][j];
      s += x * x;
    }
    const dist = Math.sqrt(s);
    if (dist < bd) {
      bd = dist;
      bi = i;
    }
  }
  return bd <= t ? { index: bi, distance: bd } : null;
}
export const detectFaces = detectAndIdentify;
export const findBestMatchFast = matchFace;
