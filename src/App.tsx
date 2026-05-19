import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crop,
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
  Layers,
  Lock,
  Menu,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";

type Screen =
  | "home"
  | "compress"
  | "resize"
  | "crop"
  | "jpg"
  | "imagepdf"
  | "editor"
  | "watermark"
  | "blur"
  | "privacy"
  | "terms"
  | "contact";

type ToolCategory = "all" | "optimize" | "edit" | "convert" | "security";
type WatermarkStyle = "stamp" | "diagonalBand" | "repeat" | "horizontalBand";
type FilterPreset = "none" | "gray" | "sepia" | "warm" | "cool";

type UploadedImage = {
  id: string;
  file: File;
  previewUrl: string;
  originalKB: number;
  width: number;
  height: number;
};

type ResultImage = {
  id: string;
  originalName: string;
  originalKB: number;
  resultKB: number;
  width: number;
  height: number;
  blob: Blob;
  url: string;
  downloadName: string;
  note?: string;
};

type BlurBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ToolItem = {
  title: string;
  desc: string;
  category: ToolCategory;
  screen: Screen;
  icon: React.ReactNode;
};

const tools: ToolItem[] = [
  {
    title: "이미지 압축",
    desc: "JPG, PNG, WebP 이미지를 용량 제한에 맞게 줄입니다.",
    category: "optimize",
    screen: "compress",
    icon: <Upload size={22} />,
  },
  {
    title: "이미지 크기 조절",
    desc: "가로·세로 픽셀 또는 비율로 이미지 크기를 조정합니다.",
    category: "edit",
    screen: "resize",
    icon: <ImageIcon size={22} />,
  },
  {
    title: "이미지 잘라내기",
    desc: "증명사진, 썸네일, 제출용 비율에 맞게 이미지를 자릅니다.",
    category: "edit",
    screen: "crop",
    icon: <Crop size={22} />,
  },
  {
    title: "JPG로 변환",
    desc: "PNG, WebP 이미지를 JPG 파일로 간단히 변환합니다.",
    category: "convert",
    screen: "jpg",
    icon: <FileText size={22} />,
  },
  {
    title: "이미지 PDF 변환",
    desc: "여러 장의 이미지를 하나의 PDF 파일로 묶습니다.",
    category: "convert",
    screen: "imagepdf",
    icon: <Layers size={22} />,
  },
  {
    title: "간단 포토 에디터",
    desc: "필터, 회전, 반전, 텍스트, 프레임을 적용합니다.",
    category: "edit",
    screen: "editor",
    icon: <Wand2 size={22} />,
  },
  {
    title: "워터마크 넣기",
    desc: "이미지에 텍스트 워터마크를 추가합니다.",
    category: "security",
    screen: "watermark",
    icon: <ShieldCheck size={22} />,
  },
  {
    title: "개인정보 가리기",
    desc: "얼굴, 차량번호, 민감한 영역을 블러 처리합니다.",
    category: "security",
    screen: "blur",
    icon: <Lock size={22} />,
  },
];

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatFileSize(kb: number) {
  if (!Number.isFinite(kb)) return "0KB";
  if (kb >= 1024) return `${(kb / 1024).toFixed(kb >= 10240 ? 1 : 2)}MB`;
  return `${Math.max(1, Math.round(kb))}KB`;
}

function getTodayString() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Canvas conversion failed"));
        else resolve(blob);
      },
      type,
      quality
    );
  });
}

function loadImage(fileOrUrl: File | string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = typeof fileOrUrl === "string" ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  });
}

async function getImageSize(url: string) {
  const image = await loadImage(url);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

async function readFiles(fileList?: FileList | File[] | null) {
  if (!fileList) return [];
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  const images = await Promise.all(
    files.map(async (file) => {
      const previewUrl = URL.createObjectURL(file);
      const size = await getImageSize(previewUrl);
      return {
        id: `${file.name}-${file.size}-${makeId()}`,
        file,
        previewUrl,
        originalKB: Math.round(file.size / 1024),
        width: size.width,
        height: size.height,
      } satisfies UploadedImage;
    })
  );
  return images;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

async function saveResultsAsZip(results: ResultImage[], zipName: string) {
  const zip = new JSZip();
  results.forEach((result) => zip.file(result.downloadName, result.blob));
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

async function saveResultsToFolder(results: ResultImage[]) {
  const browserWindow = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };

  if (!browserWindow.showDirectoryPicker) {
    alert("현재 브라우저에서는 폴더 선택 저장을 지원하지 않아요. Chrome 또는 Edge 최신 버전에서 ZIP 다운로드를 이용해 주세요.");
    return;
  }

  try {
    const directoryHandle = await browserWindow.showDirectoryPicker();
    for (const result of results) {
      const fileHandle = await directoryHandle.getFileHandle(result.downloadName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(result.blob);
      await writable.close();
    }
    alert("선택한 폴더에 저장되었습니다.");
  } catch (error) {
    console.log("Folder save was cancelled or failed.", error);
  }
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

async function resizeCanvasFromImage(image: HTMLImageElement, width: number, height: number, fillWhite = true) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  if (fillWhite) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function compressOneImage(item: UploadedImage, targetKB: number) {
  const image = await loadImage(item.file);
  let scale = 1;
  let quality = 0.92;
  let bestBlob: Blob | null = null;
  let bestWidth = image.width;
  let bestHeight = image.height;

  for (let i = 0; i < 28; i++) {
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = await resizeCanvasFromImage(image, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    bestBlob = blob;
    bestWidth = width;
    bestHeight = height;
    if (blob.size / 1024 <= targetKB || (quality <= 0.25 && scale <= 0.35)) break;
    if (quality > 0.45) quality -= 0.08;
    else scale *= 0.88;
  }

  if (!bestBlob) throw new Error("Compression failed");
  const resultKB = Math.round(bestBlob.size / 1024);
  const url = URL.createObjectURL(bestBlob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: bestWidth,
    height: bestHeight,
    blob: bestBlob,
    url,
    downloadName: `${baseName}_compressed_${targetKB}KB.jpg`,
    note: resultKB <= targetKB ? `${targetKB}KB 이하에 맞췄습니다.` : "가능한 범위에서 최대한 줄였습니다.",
  } satisfies ResultImage;
}

async function convertToJpgOneImage(item: UploadedImage) {
  const image = await loadImage(item.file);
  const canvas = await resizeCanvasFromImage(image, image.width, image.height, true);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}.jpg`,
  } satisfies ResultImage;
}

async function resizeOneImage(item: UploadedImage, width: number, height: number, format: "jpeg" | "png") {
  const image = await loadImage(item.file);
  const canvas = await resizeCanvasFromImage(image, width, height, format === "jpeg");
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mime, 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}_resized.${format === "png" ? "png" : "jpg"}`,
  } satisfies ResultImage;
}

async function cropOneImage(item: UploadedImage, ratio: "1:1" | "3:4" | "4:3" | "16:9" | "free", format: "jpeg" | "png") {
  const image = await loadImage(item.file);
  let targetRatio = image.width / image.height;
  if (ratio !== "free") {
    const [rw, rh] = ratio.split(":").map(Number);
    targetRatio = rw / rh;
  }

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  const sourceRatio = image.width / image.height;

  if (sourceRatio > targetRatio) {
    sw = Math.round(image.height * targetRatio);
    sx = Math.round((image.width - sw) / 2);
  } else {
    sh = Math.round(image.width / targetRatio);
    sy = Math.round((image.height - sh) / 2);
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  canvas.width = sw;
  canvas.height = sh;
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mime, 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}_cropped.${format === "png" ? "png" : "jpg"}`,
  } satisfies ResultImage;
}

async function editOneImage(
  item: UploadedImage,
  options: {
    rotation: number;
    brightness: number;
    contrast: number;
    saturation: number;
    filterPreset: FilterPreset;
    flipX: boolean;
    flipY: boolean;
    textBoxes: TextBox[];
    borderWidth: number;
    borderColor: string;
    saveFormat: "jpeg" | "png";
  }
) {
  const image = await loadImage(item.file);
  const normalizedRotation = ((options.rotation % 360) + 360) % 360;
  const isSideways = normalizedRotation === 90 || normalizedRotation === 270;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  canvas.width = isSideways ? image.height : image.width;
  canvas.height = isSideways ? image.width : image.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const presetFilter =
    options.filterPreset === "gray"
      ? "grayscale(100%)"
      : options.filterPreset === "sepia"
        ? "sepia(80%)"
        : options.filterPreset === "warm"
          ? "sepia(25%) saturate(120%) brightness(105%)"
          : options.filterPreset === "cool"
            ? "hue-rotate(190deg) saturate(115%)"
            : "";

  ctx.filter = `brightness(${options.brightness}%) contrast(${options.contrast}%) saturate(${options.saturation}%) ${presetFilter}`;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";

  if (options.borderWidth > 0) {
    ctx.strokeStyle = options.borderColor;
    ctx.lineWidth = options.borderWidth;
    ctx.strokeRect(options.borderWidth / 2, options.borderWidth / 2, canvas.width - options.borderWidth, canvas.height - options.borderWidth);
  }

  options.textBoxes.forEach((box) => {
    if (!box.text.trim()) return;
    const x = canvas.width * (box.x / 100);
    const y = canvas.height * (box.y / 100);
    const width = canvas.width * (box.width / 100);
    const height = canvas.height * (box.height / 100);
    const fontSize = Math.max(16, Math.round(height * 0.55));
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.08));
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(box.text, x + width / 2, y + height / 2);
    ctx.fillText(box.text, x + width / 2, y + height / 2);
  });

  const mime = options.saveFormat === "png" ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mime, options.saveFormat === "png" ? 1 : 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}_edited.${options.saveFormat === "png" ? "png" : "jpg"}`,
  } satisfies ResultImage;
}

async function watermarkOneImage(
  item: UploadedImage,
  text: string,
  position: "center" | "bottomRight" | "bottomLeft" | "topRight" | "topLeft",
  opacity: number,
  fontSize: number,
  watermarkStyle: WatermarkStyle
) {
  const image = await loadImage(item.file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const content = text.trim() || "FileXact";
  const scaledFontSize = Math.max(16, Math.round((fontSize / 900) * Math.max(canvas.width, canvas.height)));
  const drawText = (x: number, y: number, align: CanvasTextAlign = "center") => {
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(3, Math.round(scaledFontSize * 0.08));
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(content, x, y);
    ctx.fillText(content, x, y);
  };

  ctx.save();
  ctx.globalAlpha = opacity / 100;
  ctx.font = `900 ${scaledFontSize}px Arial, sans-serif`;

  if (watermarkStyle === "diagonalBand") {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-28 * Math.PI) / 180);
    const bandHeight = scaledFontSize * 2.3;
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(-canvas.width, -bandHeight / 2, canvas.width * 2, bandHeight);
    drawText(0, 0);
  } else if (watermarkStyle === "repeat") {
    ctx.rotate((-24 * Math.PI) / 180);
    const gapX = scaledFontSize * 6.5;
    const gapY = scaledFontSize * 4;
    for (let y = -canvas.height; y < canvas.height * 2; y += gapY) {
      for (let x = -canvas.width; x < canvas.width * 2; x += gapX) drawText(x, y);
    }
  } else if (watermarkStyle === "horizontalBand") {
    const bandHeight = scaledFontSize * 2.3;
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(0, canvas.height / 2 - bandHeight / 2, canvas.width, bandHeight);
    drawText(canvas.width / 2, canvas.height / 2);
  } else {
    const padding = Math.round(scaledFontSize * 0.8);
    let x = canvas.width - padding;
    let y = canvas.height - padding;
    let align: CanvasTextAlign = "right";
    if (position === "center") {
      x = canvas.width / 2;
      y = canvas.height / 2;
      align = "center";
    } else if (position === "bottomLeft") {
      x = padding;
      y = canvas.height - padding;
      align = "left";
    } else if (position === "topRight") {
      x = canvas.width - padding;
      y = padding;
      align = "right";
    } else if (position === "topLeft") {
      x = padding;
      y = padding;
      align = "left";
    }
    drawText(x, y, align);
  }
  ctx.restore();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}_watermark.jpg`,
  } satisfies ResultImage;
}

async function blurOneImage(item: UploadedImage, boxes: BlurBox[], blurStrength: number) {
  const image = await loadImage(item.file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  boxes.forEach((box) => {
    const x = Math.round(canvas.width * (box.x / 100));
    const y = Math.round(canvas.height * (box.y / 100));
    const areaWidth = Math.round(canvas.width * (box.width / 100));
    const areaHeight = Math.round(canvas.height * (box.height / 100));
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) throw new Error("Canvas context not available");
    tempCanvas.width = areaWidth;
    tempCanvas.height = areaHeight;
    tempCtx.filter = `blur(${blurStrength}px)`;
    tempCtx.drawImage(canvas, x, y, areaWidth, areaHeight, 0, 0, areaWidth, areaHeight);
    const radius = Math.max(8, Math.round(Math.min(areaWidth, areaHeight) * 0.08));
    ctx.save();
    roundedRectPath(ctx, x, y, areaWidth, areaHeight, radius);
    ctx.clip();
    ctx.drawImage(tempCanvas, x, y);
    ctx.restore();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
    ctx.lineWidth = Math.max(3, Math.round(canvas.width * 0.004));
    roundedRectPath(ctx, x, y, areaWidth, areaHeight, radius);
    ctx.stroke();
  });

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
  const resultKB = Math.round(blob.size / 1024);
  const url = URL.createObjectURL(blob);
  const baseName = item.file.name.replace(/\.[^/.]+$/, "");
  return {
    id: item.id,
    originalName: item.file.name,
    originalKB: item.originalKB,
    resultKB,
    width: canvas.width,
    height: canvas.height,
    blob,
    url,
    downloadName: `${baseName}_private_blur.jpg`,
    note: `${boxes.length}개 영역을 블러 처리했습니다.`,
  } satisfies ResultImage;
}


const screenMeta: Record<Screen, { title: string; description: string }> = {
  home: {
    title: "FileXact - 정확하고 빠른 온라인 이미지·PDF 도구",
    description: "FileXact는 이미지 압축, 크기 조절, JPG 변환, 이미지 PDF 변환, 워터마크, 개인정보 가리기를 제공하는 온라인 파일 도구입니다.",
  },
  compress: {
    title: "이미지 압축 - FileXact",
    description: "JPG, PNG, WebP 이미지를 제출 기준에 맞게 빠르게 압축하세요.",
  },
  resize: {
    title: "이미지 크기 조절 - FileXact",
    description: "가로·세로 픽셀 기준으로 이미지 크기를 조절하세요.",
  },
  crop: {
    title: "이미지 잘라내기 - FileXact",
    description: "증명사진, 썸네일, 제출용 비율에 맞게 이미지를 자르세요.",
  },
  jpg: {
    title: "JPG로 변환 - FileXact",
    description: "PNG, WebP 이미지를 JPG 파일로 간단히 변환하세요.",
  },
  imagepdf: {
    title: "이미지 PDF 변환 - FileXact",
    description: "여러 장의 이미지를 하나의 PDF 파일로 묶어 제출용 파일을 만드세요.",
  },
  editor: {
    title: "간단 포토 에디터 - FileXact",
    description: "필터, 회전, 반전, 텍스트, 프레임을 브라우저에서 바로 적용하세요.",
  },
  watermark: {
    title: "워터마크 넣기 - FileXact",
    description: "이미지에 텍스트 워터마크, 대각선 띠, 반복 패턴을 적용하세요.",
  },
  blur: {
    title: "개인정보 가리기 - FileXact",
    description: "얼굴, 차량번호, 민감한 영역을 블러 처리해 제출 전 파일을 정리하세요.",
  },
  privacy: {
    title: "개인정보처리방침 - FileXact",
    description: "FileXact 개인정보 처리 기준과 파일 처리 방식을 안내합니다.",
  },
  terms: {
    title: "이용약관 - FileXact",
    description: "FileXact 온라인 이미지·PDF 도구 이용약관을 확인하세요.",
  },
  contact: {
    title: "문의하기 - FileXact",
    description: "FileXact 기능 오류, 기능 제안, 개인정보 및 약관 문의를 남겨주세요.",
  },
};

function updateMetaTag(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function App() {
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    const meta = screenMeta[screen];
    document.title = meta.title;
    updateMetaTag("description", meta.description);
    updateMetaTag("application-name", "FileXact");
    updateMetaTag("theme-color", "#2563eb");
  }, [screen]);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Header setScreen={setScreen} />
      {screen === "home" && <HomeScreen setScreen={setScreen} />}
      {screen === "compress" && <CompressScreen goHome={() => setScreen("home")} />}
      {screen === "resize" && <ResizeScreen goHome={() => setScreen("home")} />}
      {screen === "crop" && <CropScreen goHome={() => setScreen("home")} />}
      {screen === "jpg" && <JpgScreen goHome={() => setScreen("home")} />}
      {screen === "imagepdf" && <ImagePdfScreen goHome={() => setScreen("home")} />}
      {screen === "editor" && <PhotoEditorScreen goHome={() => setScreen("home")} />}
      {screen === "watermark" && <WatermarkScreen goHome={() => setScreen("home")} />}
      {screen === "blur" && <PrivacyBlurScreen goHome={() => setScreen("home")} />}
      {screen === "privacy" && <SimplePage title="개인정보처리방침" goHome={() => setScreen("home")} />}
      {screen === "terms" && <SimplePage title="이용약관" goHome={() => setScreen("home")} />}
      {screen === "contact" && <SimplePage title="문의하기" goHome={() => setScreen("home")} />}
    </div>
  );
}

function Header({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const navItems: { label: string; screen: Screen }[] = [
    { label: "이미지 압축", screen: "compress" },
    { label: "이미지 크기 조절", screen: "resize" },
    { label: "이미지 잘라내기", screen: "crop" },
    { label: "JPG로 변환", screen: "jpg" },
    { label: "툴 더보기", screen: "home" },
  ];

  const go = (screen: Screen) => {
    setScreen(screen);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <button onClick={() => go("home")} className="flex cursor-pointer items-center gap-2 rounded-xl px-1 py-1 hover:bg-slate-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white"><FileImage size={21} /></span>
          <span className="text-left leading-tight">
            <span className="block text-2xl font-black tracking-tight">File<span className="text-violet-500">X</span><span className="text-blue-600">act</span></span>
            <span className="block text-xs font-bold text-slate-500">파일잭트</span>
          </span>
        </button>
        <nav className="hidden items-center gap-8 text-sm font-black text-slate-700 md:flex">
          {navItems.map((item) => <button key={item.label} onClick={() => go(item.screen)} className="cursor-pointer hover:text-blue-600">{item.label}</button>)}
        </nav>
        <div className="flex items-center gap-2">
          <button className="hidden cursor-pointer px-3 py-2 text-sm font-black hover:text-blue-600 sm:block">로그인</button>
          <button className="hidden cursor-pointer rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 sm:block">가입하기</button>
          <button onClick={() => setOpen((prev) => !prev)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200"><Menu /></button>
        </div>
      </div>
      {open && (
        <div className="border-t bg-white p-4 md:hidden">
          <div className="grid gap-2">
            {navItems.map((item) => <button key={item.label} onClick={() => go(item.screen)} className="flex cursor-pointer items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left font-black">{item.label}<ArrowRight size={16} /></button>)}
            <button className="rounded-2xl border px-4 py-3 font-black">로그인</button>
            <button className="rounded-2xl bg-blue-600 px-4 py-3 font-black text-white">가입하기</button>
          </div>
        </div>
      )}
    </header>
  );
}

function HomeScreen({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const [category, setCategory] = useState<ToolCategory>("all");
  const filteredTools = category === "all" ? tools : tools.filter((tool) => tool.category === category);
  const categories: { label: string; value: ToolCategory }[] = [
    { label: "모두", value: "all" },
    { label: "최적화", value: "optimize" },
    { label: "편집", value: "edit" },
    { label: "변환", value: "convert" },
    { label: "보안", value: "security" },
  ];

  return (
    <main>
      <section className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 pb-10 pt-14 md:pb-12 md:pt-16">
        <div className="mx-auto max-w-7xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm"><Sparkles size={16} /> 회원가입 없이 바로 사용</span>
          <h1 className="mt-7 text-4xl font-black leading-tight tracking-tight md:text-6xl">
            정확하고 빠른<br />온라인 이미지·PDF 도구
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">이미지 압축부터 PDF 변환까지, 오차 없이 빠르게 제출용 파일을 정리하세요.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {categories.map((item) => <button key={item.value} onClick={() => setCategory(item.value)} className={`cursor-pointer rounded-full border px-5 py-2 text-sm font-black shadow-sm ${category === item.value ? "bg-slate-950 text-white" : "bg-white hover:bg-slate-50"}`}>{item.label}</button>)}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4fa] px-4 py-8">
        <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filteredTools.map((tool) => (
            <button key={tool.title} onClick={() => setScreen(tool.screen)} className="group min-h-[168px] cursor-pointer rounded-3xl border border-slate-950 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white transition group-hover:scale-105">{tool.icon}</span>
              <h3 className="text-xl font-black">{tool.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">{tool.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto mb-8 max-w-7xl text-center">
          <div className="mb-4 flex items-center justify-center gap-5">
            <span className="hidden h-px w-32 bg-blue-100 md:block" />
            <h2 className="text-3xl font-black tracking-tight text-blue-600 md:text-4xl">
              왜 File<span className="text-violet-500">X</span>act인가요?
            </h2>
            <span className="hidden h-px w-32 bg-blue-100 md:block" />
          </div>
          <p className="text-sm leading-6 text-slate-500 md:text-base">
            빠른 처리, 개인정보 고려, 제출 상황 특화까지 제출용 파일 정리에 필요한 기준을 담았습니다.
          </p>
        </div>
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          <TrustCard icon={<Zap size={20} />} title="빠른 처리" desc="브라우저에서 바로 처리해 제출용 파일을 빠르게 정리할 수 있습니다." />
          <TrustCard icon={<ShieldCheck size={20} />} title="개인정보 고려" desc="서버 업로드 없이 처리하는 구조를 우선 적용해 민감한 파일 부담을 줄였습니다." />
          <TrustCard icon={<CheckCircle2 size={20} />} title="제출 상황 특화" desc="이력서, 청약, 공공기관 첨부파일처럼 실제 제출 조건에 맞춘 도구로 확장합니다." />
        </div>
      </section>
      <GuideSection />
      <GlobalTrustSection />
      <Footer setScreen={setScreen} />
    </main>
  );
}

function TrustCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return <article className="rounded-3xl border border-slate-950 bg-slate-50 p-6"><span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">{icon}</span><h3 className="text-xl font-black">{title}</h3><p className="mt-4 text-sm leading-6 text-slate-600">{desc}</p></article>;
}

function GuideSection() {
  const guides = [
    {
      category: "이력서·취업",
      title: "이력서 사진 500KB 이하로 줄이는 법",
      desc: "채용 사이트 업로드 기준에 맞춰 사진 용량을 줄이고 JPG로 정리하는 방법을 안내합니다.",
      tag: "이미지 압축",
    },
    {
      category: "청약·주거",
      title: "청약 서류 PDF 용량 줄이는 법",
      desc: "스캔 서류와 캡처 이미지를 제출 가능한 PDF 용량으로 정리하는 흐름을 설명합니다.",
      tag: "PDF 변환",
    },
    {
      category: "공공기관",
      title: "주민등록등본 이미지 PDF로 만드는 법",
      desc: "등본, 가족관계증명서 같은 이미지 파일을 한 개의 PDF로 묶는 방법을 정리합니다.",
      tag: "이미지 PDF",
    },
    {
      category: "첨부파일 제한",
      title: "공공기관 첨부파일 2MB 이하 맞추는 법",
      desc: "파일 업로드 실패를 줄이기 위해 이미지 크기와 용량을 함께 조절하는 기준을 안내합니다.",
      tag: "용량 제한",
    },
    {
      category: "모바일 사진",
      title: "아이폰 사진 용량 줄여서 제출하는 법",
      desc: "아이폰 사진을 제출용 JPG 파일로 변환하고 용량을 낮추는 과정을 쉽게 설명합니다.",
      tag: "모바일",
    },
    {
      category: "모바일 사진",
      title: "갤럭시 사진을 PDF 파일로 바꾸는 법",
      desc: "갤럭시에서 촬영한 서류 사진을 PDF 제출 파일로 만드는 방법을 안내합니다.",
      tag: "PDF 만들기",
    },
  ];

  return (
    <section className="bg-slate-50 px-4 py-12 md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
              <Scissors />
            </span>
            <div>
              <p className="text-sm font-black text-blue-600">FileXact Guide</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">제출 파일 가이드</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 md:text-base">
                청약, 취업, 공공기관 첨부파일처럼 실제 제출 상황에 맞춘 안내 콘텐츠입니다.
              </p>
            </div>
          </div>
          <button className="w-fit cursor-pointer rounded-full border bg-white px-5 py-2 text-sm font-black text-slate-700 hover:border-blue-500 hover:text-blue-600">
            전체 가이드 보기
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guides.map((guide) => (
            <article
              key={guide.title}
              className="group cursor-pointer rounded-3xl border border-slate-950 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600">{guide.category}</span>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-600">{guide.tag}</span>
              </div>
              <h3 className="text-lg font-black leading-7 group-hover:text-blue-600">{guide.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">{guide.desc}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600">
                자세히 보기 <ArrowRight size={16} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function GlobalTrustSection() {
  return (
    <section className="bg-white px-4 py-16 md:py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-black leading-tight tracking-tight text-slate-950 md:text-5xl">
          빠르고 정확한 제출용 파일 정리를 위한<br className="hidden md:block" /> 신뢰할 수 있는 온라인 이미지 편집
        </h2>
        <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
          FileXact는 이미지 압축, 크기 조절, PDF 변환, 개인정보 가리기까지
          브라우저에서 바로 사용할 수 있는 파일 정리 도구입니다.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-slate-500">
          <div className="flex items-center gap-3 rounded-2xl border bg-slate-50 px-5 py-3">
            <ShieldCheck size={28} className="text-blue-600" />
            <div className="text-left">
              <p className="text-sm font-black text-slate-800">브라우저 기반 처리</p>
              <p className="text-xs font-bold text-slate-500">MVP 단계 서버 업로드 최소화</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-slate-50 px-5 py-3">
            <Zap size={28} className="text-blue-600" />
            <div className="text-left">
              <p className="text-sm font-black text-slate-800">빠른 작업 흐름</p>
              <p className="text-xs font-bold text-slate-500">회원가입 없이 바로 사용</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-slate-50 px-5 py-3">
            <CheckCircle2 size={28} className="text-violet-500" />
            <div className="text-left">
              <p className="text-sm font-black text-slate-800">제출 상황 특화</p>
              <p className="text-xs font-bold text-slate-500">청약·취업·공공기관 첨부파일</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const productLinks: { label: string; screen: Screen }[] = [
    { label: "홈", screen: "home" },
    { label: "이미지 압축", screen: "compress" },
    { label: "이미지 크기 조절", screen: "resize" },
    { label: "이미지 PDF 변환", screen: "imagepdf" },
    { label: "개인정보 가리기", screen: "blur" },
  ];
  const guideLinks = ["이력서 사진 용량 줄이기", "청약 서류 PDF 만들기", "공공기관 첨부파일 정리", "이미지 워터마크 넣기"];

  return (
    <footer className="bg-[#24242c] px-4 py-14 text-slate-200 md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <button onClick={() => setScreen("home")} className="flex cursor-pointer items-center gap-3 text-left">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <FileImage size={22} />
              </span>
              <span className="leading-tight">
                <span className="block text-2xl font-black tracking-tight text-white">
                  File<span className="text-violet-500">X</span><span className="text-blue-400">act</span>
                </span>
                <span className="block text-xs font-bold text-slate-400">파일잭트 · 제출용 파일 도구</span>
              </span>
            </button>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              빠르고 정확한 이미지·PDF 정리를 위한 온라인 파일 도구입니다.
              작은 용량 제한부터 민감정보 가리기까지 제출 전 작업을 간단하게 처리하세요.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-black text-white">제품</h3>
            <div className="space-y-3 text-sm font-bold text-slate-400">
              {productLinks.map((item) => (
                <button key={item.label} onClick={() => setScreen(item.screen)} className="block cursor-pointer hover:text-white">
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-black text-white">가이드</h3>
            <div className="space-y-3 text-sm font-bold text-slate-400">
              {guideLinks.map((item) => (
                <button key={item} className="block cursor-pointer text-left hover:text-white">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-black text-white">회사</h3>
            <div className="space-y-3 text-sm font-bold text-slate-400">
              <button onClick={() => setScreen("privacy")} className="block cursor-pointer hover:text-white">개인정보처리방침</button>
              <button onClick={() => setScreen("terms")} className="block cursor-pointer hover:text-white">이용약관</button>
              <button onClick={() => setScreen("contact")} className="block cursor-pointer hover:text-white">문의하기</button>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-sm text-slate-400 md:flex md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-white/20 px-3 py-2 font-bold">한국어</span>
            <span>© FileXact · 파일잭트</span>
          </div>
          <p className="mt-4 md:mt-0">정확하고 빠른 온라인 이미지·PDF 도구</p>
        </div>
      </div>
    </footer>
  );
}

function BackButton({ goHome }: { goHome: () => void }) {
  return <button onClick={goHome} className="mb-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-100"><ArrowLeft size={16} /> 돌아가기</button>;
}

function SidebarPreview({ title, items }: { title: string; items: UploadedImage[] }) {
  if (items.length === 0) return null;
  return <div className="rounded-3xl border bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-black">{title}</p><p className="mt-1 text-xs text-slate-500">업로드한 이미지를 작업 전 확인하세요.</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-black text-blue-600 shadow-sm">{items.length}개</span></div><div className="max-h-60 space-y-3 overflow-y-auto">{items.map((item) => <div key={item.id} className="rounded-2xl border bg-white p-3"><img src={item.previewUrl} alt={item.file.name} className="h-28 w-full rounded-xl bg-slate-50 object-contain" /><p className="mt-2 truncate text-xs font-bold">{item.file.name}</p></div>)}</div></div>;
}

function UploadBox({ onFiles, multiple, title, desc, icon }: { onFiles: (files?: FileList | null) => void; multiple?: boolean; title: string; desc: string; icon: React.ReactNode }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return <div className="flex min-h-[62vh] flex-col items-center justify-center text-center"><h1 className="text-3xl font-black md:text-5xl">{title}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-lg">{desc}</p><div className="mt-8 w-full max-w-xl cursor-pointer rounded-3xl border-2 border-dashed border-blue-200 bg-white p-10 shadow-sm transition hover:border-blue-500 hover:bg-blue-50" onClick={() => inputRef.current?.click()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()}><input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={(e) => onFiles(e.target.files)} /> <div className="mx-auto mb-4 text-blue-600">{icon}</div><p className="text-xl font-black">이미지 선택</p><p className="mt-3 text-sm text-slate-500">여기에 이미지를 끌어와도 됩니다.</p></div></div>;
}

function ResultList({ results, zipName }: { results: ResultImage[]; zipName: string }) {
  if (results.length === 0) return null;
  return <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-black">처리 결과</h3><div className="flex flex-wrap gap-2"><button onClick={() => saveResultsAsZip(results, zipName)} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">ZIP 전체 다운로드</button><button onClick={() => saveResultsToFolder(results)} className="rounded-2xl border px-4 py-3 text-sm font-black hover:bg-slate-50">폴더 저장</button></div></div><div className="grid gap-4 md:grid-cols-2">{results.map((result) => <article key={result.id} className="rounded-2xl border p-4"><div className="flex gap-3"><img src={result.url} alt={result.originalName} className="h-24 w-24 rounded-xl bg-slate-50 object-contain" /><div className="min-w-0 flex-1"><p className="truncate font-black">{result.originalName}</p><p className="mt-1 text-sm text-slate-500">{formatFileSize(result.originalKB)} → {formatFileSize(result.resultKB)}</p><p className="mt-1 text-xs text-slate-500">{result.width}×{result.height}</p></div></div><a href={result.url} download={result.downloadName} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800"><Download size={17} /> 개별 다운로드</a></article>)}</div></div>;
}

function CompressScreen({ goHome }: { goHome: () => void }) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [results, setResults] = useState<ResultImage[]>([]);
  const [targetKB, setTargetKB] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = async (files?: FileList | null) => {
    setError("");
    setResults([]);
    const next = await readFiles(files);
    if (next.length === 0) setError("이미지 파일을 선택해 주세요.");
    setImages((prev) => [...prev, ...next]);
  };

  const run = async () => {
    if (images.length === 0) return setError("먼저 이미지를 업로드해 주세요.");
    setBusy(true);
    setError("");
    try { setResults(await Promise.all(images.map((item) => compressOneImage(item, targetKB)))); }
    catch { setError("압축 중 문제가 발생했습니다."); }
    finally { setBusy(false); }
  };

  if (images.length === 0) return <ToolLayout goHome={goHome} side={<CompressSide targetKB={targetKB} setTargetKB={setTargetKB} run={run} busy={busy} error={error} disabled />}><UploadBox multiple title="이미지 압축" desc="JPG, PNG, WebP 이미지를 원하는 목표 용량에 맞게 압축합니다." icon={<Upload size={46} />} onFiles={handleFiles} /></ToolLayout>;

  return <ToolLayout goHome={goHome} side={<CompressSide targetKB={targetKB} setTargetKB={setTargetKB} run={run} busy={busy} error={error} />}><ToolHeader title="이미지 압축" sub={`${images.length}개 이미지 선택`} onAdd={() => document.getElementById("compress-add")?.click()} /><input id="compress-add" type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} /><ImageGrid images={images} remove={(id) => setImages((prev) => prev.filter((item) => item.id !== id))} /><ResultList results={results} zipName={`filexact_compressed_${getTodayString()}.zip`} /></ToolLayout>;
}

function CompressSide({ targetKB, setTargetKB, run, busy, error, disabled }: { targetKB: number; setTargetKB: (n: number) => void; run: () => void; busy: boolean; error: string; disabled?: boolean }) {
  return <div className="space-y-5"><h2 className="text-center text-2xl font-black">압축 설정</h2><div className="rounded-2xl bg-blue-50 p-4 text-center text-sm font-bold text-blue-700">목표 용량 이하에 최대한 가깝게 압축합니다.</div><div><p className="mb-2 font-black">목표 용량</p><div className="grid grid-cols-2 gap-2">{[[500, "500KB"], [1024, "1MB"], [2048, "2MB"], [5120, "5MB"]].map(([value, label]) => <button key={value} onClick={() => setTargetKB(Number(value))} className={`rounded-2xl border px-4 py-3 font-black ${targetKB === Number(value) ? "bg-slate-950 text-white" : "bg-white hover:bg-slate-50"}`}>{label}</button>)}</div><div className="mt-3 flex items-center gap-2 rounded-2xl border p-3"><input type="number" min={50} value={Math.round(targetKB / 1024)} onChange={(e) => setTargetKB(Math.max(50, Number(e.target.value || 1) * 1024))} className="w-full rounded-xl border px-3 py-2" /><span className="font-black">MB 이하</span></div></div>{error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">{error}</p>}<button onClick={run} disabled={busy || disabled} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "압축 중..." : "이미지 압축"}<ArrowRight /></button></div>;
}

function ToolLayout({ children, side, goHome }: { children: React.ReactNode; side: React.ReactNode; goHome: () => void }) {
  return <section className="min-h-[calc(100vh-4rem)] bg-[#f4f4fa]"><div className="mx-auto grid max-w-7xl lg:grid-cols-[1fr_380px]"><div className="px-4 py-6 lg:min-h-[calc(100vh-4rem)] lg:border-r"><BackButton goHome={goHome} />{children}</div><aside className="bg-white p-5"><div className="sticky top-20">{side}</div></aside></div></section>;
}

function ToolHeader({ title, sub, onAdd }: { title: string; sub: string; onAdd?: () => void }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">{title}</h1><p className="mt-1 text-sm text-slate-500">{sub}</p></div>{onAdd && <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"><Plus size={17} /> 이미지 추가</button>}</div>;
}

function ImageGrid({ images, remove }: { images: UploadedImage[]; remove: (id: string) => void }) {
  return <div className="grid gap-4 md:grid-cols-3">{images.map((item) => <article key={item.id} className="relative rounded-3xl bg-white p-3 shadow-sm"><button onClick={() => remove(item.id)} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg font-black text-red-600 shadow">×</button><img src={item.previewUrl} alt={item.file.name} className="h-44 w-full rounded-2xl bg-slate-50 object-contain" /><p className="mt-3 truncate text-sm font-black">{item.file.name}</p><p className="mt-1 text-xs text-slate-500">{formatFileSize(item.originalKB)} · {item.width}×{item.height}</p></article>)}</div>;
}

function SingleImageToolShell({
  goHome,
  title,
  desc,
  icon,
  renderSide,
  renderMain,
}: {
  goHome: () => void;
  title: string;
  desc: string;
  icon: React.ReactNode;
  renderSide: (item: UploadedImage | null) => React.ReactNode;
  renderMain: (item: UploadedImage, setItem: React.Dispatch<React.SetStateAction<UploadedImage | null>>) => React.ReactNode;
}) {
  const [item, setItem] = useState<UploadedImage | null>(null);

  const handleFiles = async (files?: FileList | null) => {
    const nextImages = await readFiles(files);
    if (nextImages[0]) setItem(nextImages[0]);
  };

  return (
    <ToolLayout goHome={goHome} side={renderSide(item)}>
      {!item ? (
        <UploadBox title={title} desc={desc} icon={icon} onFiles={handleFiles} />
      ) : (
        renderMain(item, setItem)
      )}
    </ToolLayout>
  );
}

function ResizeScreen({ goHome }: { goHome: () => void }) {
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(800);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [result, setResult] = useState<ResultImage | null>(null);
  const [busy, setBusy] = useState(false);

  const resizeSelectedImage = async (item: UploadedImage) => {
    setBusy(true);
    try {
      const nextResult = await resizeOneImage(item, width, height, format);
      setResult(nextResult);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SingleImageToolShell
      goHome={goHome}
      title="이미지 크기 조절"
      desc="가로·세로 픽셀 기준으로 이미지 크기를 조정합니다."
      icon={<ImageIcon size={46} />}
      renderSide={(item) => (
        <div className="space-y-5">
          <h2 className="text-center text-2xl font-black">크기 설정</h2>
          <SidebarPreview title="크기 조절 미리보기" items={item ? [item] : []} />

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-bold">
              가로
              <input
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                type="number"
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="text-sm font-bold">
              세로
              <input
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                type="number"
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
          </div>

          <FormatButtons format={format} setFormat={setFormat} />

          <button
            disabled={!item || busy}
            onClick={() => item && resizeSelectedImage(item)}
            className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white disabled:opacity-50"
          >
            {busy ? "처리 중..." : "크기 조절"}
          </button>
        </div>
      )}
      renderMain={(item) => (
        <>
          <ToolHeader title="이미지 크기 조절" sub={`${item.file.name} · ${item.width}×${item.height}`} />
          <PreviewPair item={item} result={result} />
        </>
      )}
    />
  );
}

function CropScreen({ goHome }: { goHome: () => void }) {
  const [ratio, setRatio] = useState<"1:1" | "3:4" | "4:3" | "16:9" | "free">("1:1");
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [result, setResult] = useState<ResultImage | null>(null);
  const [busy, setBusy] = useState(false);

  const cropSelectedImage = async (item: UploadedImage) => {
    setBusy(true);
    try {
      const nextResult = await cropOneImage(item, ratio, format);
      setResult(nextResult);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SingleImageToolShell
      goHome={goHome}
      title="이미지 잘라내기"
      desc="중앙 기준으로 선택한 비율에 맞춰 이미지를 자릅니다."
      icon={<Crop size={46} />}
      renderSide={(item) => (
        <div className="space-y-5">
          <h2 className="text-center text-2xl font-black">잘라내기 설정</h2>
          <SidebarPreview title="잘라내기 미리보기" items={item ? [item] : []} />

          <div className="grid grid-cols-2 gap-2">
            {(["1:1", "3:4", "4:3", "16:9", "free"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setRatio(value)}
                className={`rounded-2xl border px-3 py-3 font-black ${
                  ratio === value ? "border-blue-500 bg-blue-50" : "bg-white"
                }`}
              >
                {value === "free" ? "원본 비율" : value}
              </button>
            ))}
          </div>

          <FormatButtons format={format} setFormat={setFormat} />

          <button
            disabled={!item || busy}
            onClick={() => item && cropSelectedImage(item)}
            className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white disabled:opacity-50"
          >
            {busy ? "처리 중..." : "잘라내기"}
          </button>
        </div>
      )}
      renderMain={(item) => (
        <>
          <ToolHeader title="이미지 잘라내기" sub={`${item.file.name} · ${item.width}×${item.height}`} />
          <PreviewPair item={item} result={result} />
        </>
      )}
    />
  );
}

function FormatButtons({
  format,
  setFormat,
}: {
  format: "jpeg" | "png";
  setFormat: (format: "jpeg" | "png") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={() => setFormat("jpeg")}
        className={`rounded-2xl border px-3 py-3 font-black ${format === "jpeg" ? "border-blue-500 bg-blue-50" : "bg-white"}`}
      >
        JPG 저장
      </button>
      <button
        onClick={() => setFormat("png")}
        className={`rounded-2xl border px-3 py-3 font-black ${format === "png" ? "border-blue-500 bg-blue-50" : "bg-white"}`}
      >
        PNG 저장
      </button>
    </div>
  );
}

function PreviewPair({ item, result }: { item: UploadedImage; result: ResultImage | null }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-3xl bg-white p-4">
        <p className="mb-3 font-black">원본 이미지</p>
        <img src={item.previewUrl} alt="원본" className="h-[420px] w-full rounded-2xl bg-slate-50 object-contain" />
      </div>

      <div className="rounded-3xl bg-white p-4">
        <p className="mb-3 font-black">결과 미리보기</p>
        {result ? (
          <>
            <img src={result.url} alt="결과" className="h-[420px] w-full rounded-2xl bg-slate-50 object-contain" />
            <a
              href={result.url}
              download={result.downloadName}
              className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 font-black text-white"
            >
              다운로드
            </a>
          </>
        ) : (
          <div className="flex h-[420px] items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            처리 후 결과가 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

function JpgScreen({ goHome }: { goHome: () => void }) {
  const [images, setImages] = useState<UploadedImage[]>([]); const [results, setResults] = useState<ResultImage[]>([]); const [busy, setBusy] = useState(false);
  const handleFiles = async (files?: FileList | null) => {
    const nextImages = await readFiles(files);
    setImages((prev) => [...prev, ...nextImages]);
  };
  const run = async () => { setBusy(true); setResults(await Promise.all(images.map(convertToJpgOneImage))); setBusy(false); };
  if (images.length === 0) return <ToolLayout goHome={goHome} side={<div><h2 className="text-center text-2xl font-black">JPG 설정</h2></div>}><UploadBox multiple title="JPG로 변환" desc="PNG, WebP 이미지를 JPG로 변환합니다." icon={<FileText size={46} />} onFiles={handleFiles} /></ToolLayout>;
  return <ToolLayout goHome={goHome} side={<div className="space-y-5"><h2 className="text-center text-2xl font-black">JPG 설정</h2><SidebarPreview title="변환 미리보기" items={images} /><button onClick={run} disabled={busy} className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white">{busy ? "변환 중..." : "JPG로 변환"}</button></div>}><ToolHeader title="JPG로 변환" sub={`${images.length}개 이미지 선택`} onAdd={() => document.getElementById("jpg-add")?.click()} /><input id="jpg-add" type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} /><ImageGrid images={images} remove={(id) => setImages((prev) => prev.filter((item) => item.id !== id))} /><ResultList results={results} zipName={`filexact_jpg_${getTodayString()}.zip`} /></ToolLayout>;
}

function ImagePdfScreen({ goHome }: { goHome: () => void }) {
  const [items, setItems] = useState<UploadedImage[]>([]); const [pdfUrl, setPdfUrl] = useState(""); const [busy, setBusy] = useState(false); const [pageSize, setPageSize] = useState<"a4" | "image">("a4"); const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait"); const [fitMode, setFitMode] = useState<"contain" | "cover">("contain"); const [dragIndex, setDragIndex] = useState<number | null>(null);
  const handleFiles = async (files?: FileList | null) => {
    const nextItems = await readFiles(files);
    setItems((prev) => [...prev, ...nextItems]);
  };
  const move = (from: number, to: number) => setItems((prev) => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  const createPdf = async () => { setBusy(true); const pdf = await createPdfFromImages(items, pageSize, orientation, fitMode); const blob = pdf.output("blob"); if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(URL.createObjectURL(blob)); setBusy(false); };
  if (items.length === 0) return <ToolLayout goHome={goHome} side={<div><h2 className="text-center text-2xl font-black">PDF 설정</h2></div>}><UploadBox multiple title="이미지 PDF 변환" desc="여러 장의 이미지를 선택한 순서대로 하나의 PDF로 묶습니다." icon={<Layers size={46} />} onFiles={handleFiles} /></ToolLayout>;
  return <ToolLayout goHome={goHome} side={<div className="space-y-5"><h2 className="text-center text-2xl font-black">PDF 설정</h2><PdfPreview items={items} pageSize={pageSize} orientation={orientation} fitMode={fitMode} /><div className="grid grid-cols-2 gap-2"><button onClick={() => setPageSize("a4")} className={`rounded-2xl border px-3 py-3 font-black ${pageSize === "a4" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>A4</button><button onClick={() => setPageSize("image")} className={`rounded-2xl border px-3 py-3 font-black ${pageSize === "image" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>이미지 크기</button><button onClick={() => setOrientation("portrait")} className={`rounded-2xl border px-3 py-3 font-black ${orientation === "portrait" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>세로</button><button onClick={() => setOrientation("landscape")} className={`rounded-2xl border px-3 py-3 font-black ${orientation === "landscape" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>가로</button><button onClick={() => setFitMode("contain")} className={`rounded-2xl border px-3 py-3 font-black ${fitMode === "contain" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>전체 보이기</button><button onClick={() => setFitMode("cover")} className={`rounded-2xl border px-3 py-3 font-black ${fitMode === "cover" ? "bg-blue-50 border-blue-500" : "bg-white"}`}>꽉 채우기</button></div><button onClick={createPdf} disabled={busy} className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white">{busy ? "만드는 중..." : "PDF 만들기"}</button>{pdfUrl && <a href={pdfUrl} download={`filexact_image_pdf_${getTodayString()}.pdf`} className="block rounded-2xl bg-slate-950 px-6 py-4 text-center font-black text-white">PDF 다운로드</a>}</div>}><ToolHeader title="이미지 PDF 변환" sub={`${items.length}개 이미지 선택`} onAdd={() => document.getElementById("pdf-add")?.click()} /><input id="pdf-add" type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} /><div className="grid gap-4 md:grid-cols-3">{items.map((item, index) => <article key={item.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); }} className="relative cursor-grab rounded-3xl bg-white p-3 shadow-sm"><span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2 py-1 text-xs font-black text-white">{index + 1}</span><button onClick={() => setItems((prev) => prev.filter((v) => v.id !== item.id))} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg font-black text-red-600 shadow">×</button><img src={item.previewUrl} className="h-44 w-full rounded-2xl bg-slate-50 object-contain" /><p className="mt-3 truncate text-sm font-black">{item.file.name}</p><p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-center text-xs font-bold text-blue-600">드래그해서 순서 변경</p></article>)}</div>{pdfUrl && <div className="mt-6 rounded-3xl bg-white p-5"><h3 className="mb-4 text-xl font-black">PDF 미리보기</h3><iframe src={pdfUrl} title="PDF 미리보기" className="h-[560px] w-full rounded-2xl border" /></div>}</ToolLayout>;
}

function PdfPreview({ items, pageSize, orientation, fitMode }: { items: UploadedImage[]; pageSize: "a4" | "image"; orientation: "portrait" | "landscape"; fitMode: "contain" | "cover" }) {
  return <div className="rounded-3xl border bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><p className="font-black">PDF 결과 미리보기</p><span className="rounded-full bg-white px-2 py-1 text-xs font-black text-blue-600">{items.length}P</span></div><div className="max-h-72 space-y-3 overflow-y-auto">{items.map((item, index) => <div key={item.id} className="rounded-2xl border bg-white p-3"><div className={`mx-auto flex items-center justify-center overflow-hidden rounded-xl border ${orientation === "landscape" ? "h-28 w-full" : "h-40 w-28"}`}><img src={item.previewUrl} className={fitMode === "cover" ? "h-full w-full object-cover" : "h-full w-full object-contain"} /></div><p className="mt-2 text-xs font-black">{index + 1}페이지 · {pageSize === "a4" ? `A4 ${orientation === "portrait" ? "세로" : "가로"}` : "이미지 크기"}</p></div>)}</div></div>;
}

async function createPdfFromImages(items: UploadedImage[], pageSize: "a4" | "image", orientation: "portrait" | "landscape", fitMode: "contain" | "cover") {
  const first = items[0];
  const firstOrientation = pageSize === "image" ? (first.width >= first.height ? "landscape" : "portrait") : orientation;
  const pdf = new jsPDF({ orientation: firstOrientation, unit: "mm", format: pageSize === "a4" ? "a4" : [first.width * 0.264583, first.height * 0.264583] });
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) {
      const nextOrientation = pageSize === "image" ? (item.width >= item.height ? "landscape" : "portrait") : orientation;
      pdf.addPage(pageSize === "a4" ? "a4" : [item.width * 0.264583, item.height * 0.264583], nextOrientation);
    }
    const image = await loadImage(item.file);
    const canvas = await resizeCanvasFromImage(image, image.width, image.height, true);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageRatio = image.width / image.height;
    const pageRatio = pageWidth / pageHeight;
    let drawWidth = pageWidth;
    let drawHeight = pageHeight;
    if (fitMode === "contain") {
      if (imageRatio > pageRatio) drawHeight = pageWidth / imageRatio;
      else drawWidth = pageHeight * imageRatio;
    } else {
      if (imageRatio > pageRatio) drawWidth = pageHeight * imageRatio;
      else drawHeight = pageWidth / imageRatio;
    }
    pdf.addImage(dataUrl, "JPEG", (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);
  }
  return pdf;
}

function PhotoEditorScreen({ goHome }: { goHome: () => void }) {
  const [item, setItem] = useState<UploadedImage | null>(null); const [edited, setEdited] = useState<ResultImage | null>(null); const [rotation, setRotation] = useState(0); const [brightness, setBrightness] = useState(100); const [contrast, setContrast] = useState(100); const [saturation, setSaturation] = useState(100); const [filterPreset, setFilterPreset] = useState<FilterPreset>("none"); const [flipX, setFlipX] = useState(false); const [flipY, setFlipY] = useState(false); const [textBoxes, setTextBoxes] = useState<TextBox[]>([]); const [activeTextBoxId, setActiveTextBoxId] = useState(""); const [borderWidth, setBorderWidth] = useState(0); const [borderColor, setBorderColor] = useState("#2563eb"); const [saveFormat, setSaveFormat] = useState<"jpeg" | "png">("jpeg"); const [busy, setBusy] = useState(false); const fileInputRef = useRef<HTMLInputElement | null>(null); const previewRef = useRef<HTMLDivElement | null>(null); const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; box: TextBox } | null>(null);
  const active = textBoxes.find((b) => b.id === activeTextBoxId) || textBoxes[0];
  const preset = filterPreset === "gray" ? "grayscale(100%)" : filterPreset === "sepia" ? "sepia(80%)" : filterPreset === "warm" ? "sepia(25%) saturate(120%) brightness(105%)" : filterPreset === "cool" ? "hue-rotate(190deg) saturate(115%)" : "";
  const imgStyle = { transform: `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`, filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${preset}` };
  const addText = () => { const b = { id: makeId(), text: "텍스트", x: 35, y: 42, width: 30, height: 12 }; setTextBoxes((p) => [...p, b]); setActiveTextBoxId(b.id); };
  const updateBox = (id: string, patch: Partial<TextBox>) => setTextBoxes((p) => p.map((b) => b.id === id ? { ...b, ...patch, x: Math.min(95, Math.max(0, patch.x ?? b.x)), y: Math.min(95, Math.max(0, patch.y ?? b.y)), width: Math.min(100, Math.max(8, patch.width ?? b.width)), height: Math.min(100, Math.max(6, patch.height ?? b.height)) } : b));
  const startDrag = (e: React.MouseEvent<HTMLDivElement>, box: TextBox, mode: "move" | "resize") => { e.preventDefault(); e.stopPropagation(); setActiveTextBoxId(box.id); dragRef.current = { id: box.id, mode, startX: e.clientX, startY: e.clientY, box }; const move = (ev: MouseEvent) => { const state = dragRef.current; const rect = previewRef.current?.getBoundingClientRect(); if (!state || !rect) return; const dx = ((ev.clientX - state.startX) / rect.width) * 100; const dy = ((ev.clientY - state.startY) / rect.height) * 100; if (state.mode === "move") updateBox(state.id, { x: Math.min(100 - state.box.width, Math.max(0, state.box.x + dx)), y: Math.min(100 - state.box.height, Math.max(0, state.box.y + dy)) }); else updateBox(state.id, { width: Math.min(100 - state.box.x, Math.max(8, state.box.width + dx)), height: Math.min(100 - state.box.y, Math.max(6, state.box.height + dy)) }); }; const up = () => { dragRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); };
  const handleFiles = async (files?: FileList | null) => { const [next] = await readFiles(files); if (next) setItem(next); setEdited(null); };
  const apply = async () => { if (!item) return; setBusy(true); setEdited(await editOneImage(item, { rotation, brightness, contrast, saturation, filterPreset, flipX, flipY, textBoxes, borderWidth, borderColor, saveFormat })); setBusy(false); };
  if (!item) return <ToolLayout goHome={goHome} side={<EditorSide />}><UploadBox title="간단 포토 에디터" desc="필터, 회전, 반전, 텍스트, 프레임까지 브라우저에서 바로 편집합니다." icon={<Wand2 size={46} />} onFiles={handleFiles} /></ToolLayout>;
  return <ToolLayout goHome={goHome} side={<div className="space-y-5"><EditorControls filterPreset={filterPreset} setFilterPreset={setFilterPreset} rotation={rotation} setRotation={setRotation} flipX={flipX} setFlipX={setFlipX} flipY={flipY} setFlipY={setFlipY} brightness={brightness} setBrightness={setBrightness} contrast={contrast} setContrast={setContrast} saturation={saturation} setSaturation={setSaturation} addText={addText} active={active} updateBox={updateBox} borderWidth={borderWidth} setBorderWidth={setBorderWidth} borderColor={borderColor} setBorderColor={setBorderColor} saveFormat={saveFormat} setSaveFormat={setSaveFormat} /><button onClick={apply} disabled={busy} className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white">{busy ? "적용 중..." : "편집 적용"}</button></div>}><ToolHeader title="간단 포토 에디터" sub={`${item.file.name} · ${item.width}×${item.height}`} onAdd={() => fileInputRef.current?.click()} /><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} /><div className="grid gap-5 xl:grid-cols-2"><div className="rounded-3xl bg-white p-4"><p className="mb-3 font-black">원본 이미지</p><img src={item.previewUrl} className="h-[520px] w-full rounded-2xl bg-slate-50 object-contain" /></div><div className="rounded-3xl bg-white p-4"><div className="mb-3 flex justify-between"><p className="font-black">편집 미리보기</p><button onClick={addText} className="rounded-full bg-blue-600 px-3 py-2 text-xs font-black text-white">+ 텍스트 추가</button></div><div ref={previewRef} className="relative flex h-[520px] select-none items-center justify-center overflow-hidden rounded-2xl bg-slate-50"><img src={item.previewUrl} className="max-h-full max-w-full object-contain" style={imgStyle} />{borderWidth > 0 && <div className="pointer-events-none absolute inset-6 rounded-2xl" style={{ border: `${borderWidth}px solid ${borderColor}` }} />}{textBoxes.map((box, index) => <div key={box.id} onMouseDown={(e) => startDrag(e, box, "move")} className={`absolute cursor-move rounded-xl border-2 border-dashed bg-black/25 px-2 py-1 text-center font-black text-white ${active?.id === box.id ? "border-blue-600" : "border-white/70"}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, fontSize: `${Math.max(12, box.height * 1.5)}px` }}><span className="pointer-events-none flex h-full items-center justify-center">{box.text || `텍스트 ${index + 1}`}</span><button onClick={(e) => { e.stopPropagation(); setTextBoxes((p) => p.filter((v) => v.id !== box.id)); }} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg font-black text-red-600 shadow">×</button><div onMouseDown={(e) => startDrag(e, box, "resize")} className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl-xl bg-blue-600" /></div>)}</div><p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">텍스트 박스를 드래그해 옮기고, 오른쪽 아래 손잡이로 크기를 조절하세요.</p>{edited && <a href={edited.url} download={edited.downloadName} className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">편집 이미지 다운로드</a>}</div></div></ToolLayout>;
}

function EditorSide() { return <div><h2 className="text-center text-2xl font-black">편집 설정</h2></div>; }

function EditorControls(props: any) {
  const filters: [FilterPreset, string][] = [["none", "원본"], ["gray", "흑백"], ["sepia", "세피아"], ["warm", "따뜻하게"], ["cool", "차갑게"]];
  return <><h2 className="text-center text-2xl font-black">편집 설정</h2><div><p className="mb-2 font-black">필터</p><div className="grid grid-cols-2 gap-2">{filters.map(([value, label]) => <button key={value} onClick={() => props.setFilterPreset(value)} className={`rounded-2xl border px-3 py-2 font-black ${props.filterPreset === value ? "border-blue-500 bg-blue-50" : "bg-white"}`}>{label}</button>)}</div></div><div><p className="mb-2 font-black">회전</p><div className="grid grid-cols-4 gap-2">{[0, 90, 180, 270].map((v) => <button key={v} onClick={() => props.setRotation(v)} className={`rounded-xl border px-2 py-2 font-black ${props.rotation === v ? "border-blue-500 bg-blue-50" : "bg-white"}`}>{v}°</button>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => props.setFlipX((p: boolean) => !p)} className={`rounded-2xl border px-3 py-2 font-black ${props.flipX ? "border-blue-500 bg-blue-50" : "bg-white"}`}>좌우 반전</button><button onClick={() => props.setFlipY((p: boolean) => !p)} className={`rounded-2xl border px-3 py-2 font-black ${props.flipY ? "border-blue-500 bg-blue-50" : "bg-white"}`}>상하 반전</button></div></div>{[["밝기", props.brightness, props.setBrightness, 50, 150], ["대비", props.contrast, props.setContrast, 50, 150], ["채도", props.saturation, props.setSaturation, 0, 200]].map(([label, value, setter, min, max]) => <div key={label as string}><div className="mb-2 flex justify-between font-black"><span>{label as string}</span><span>{value as number}%</span></div><input type="range" min={min as number} max={max as number} value={value as number} onChange={(e) => setter(Number(e.target.value))} className="w-full" /></div>)}<div className="rounded-2xl border p-3"><div className="mb-3 flex justify-between"><p className="font-black">텍스트 박스</p><button onClick={props.addText} className="rounded-full bg-blue-600 px-3 py-2 text-xs font-black text-white">추가</button></div>{props.active ? <div className="space-y-3"><input value={props.active.text} onChange={(e) => props.updateBox(props.active.id, { text: e.target.value })} className="w-full rounded-xl border px-3 py-2" /><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold">가로 %<input type="number" value={Math.round(props.active.width)} onChange={(e) => props.updateBox(props.active.id, { width: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label><label className="text-xs font-bold">세로 %<input type="number" value={Math.round(props.active.height)} onChange={(e) => props.updateBox(props.active.id, { height: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label></div></div> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">텍스트 추가를 누르세요.</p>}</div><div className="rounded-2xl border p-3"><p className="mb-3 font-black">프레임 / 저장</p><div className="mb-2 flex justify-between font-black"><span>테두리 두께</span><span>{props.borderWidth}px</span></div><input type="range" min={0} max={40} value={props.borderWidth} onChange={(e) => props.setBorderWidth(Number(e.target.value))} className="w-full" /><div className="mt-3 flex items-center justify-between"><span className="font-bold">테두리 색상</span><input type="color" value={props.borderColor} onChange={(e) => props.setBorderColor(e.target.value)} /></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => props.setSaveFormat("jpeg")} className={`rounded-2xl border px-3 py-2 font-black ${props.saveFormat === "jpeg" ? "border-blue-500 bg-blue-50" : "bg-white"}`}>JPG 저장</button><button onClick={() => props.setSaveFormat("png")} className={`rounded-2xl border px-3 py-2 font-black ${props.saveFormat === "png" ? "border-blue-500 bg-blue-50" : "bg-white"}`}>PNG 저장</button></div></div></>;
}

function WatermarkScreen({ goHome }: { goHome: () => void }) {
  const [item, setItem] = useState<UploadedImage | null>(null); const [watermarked, setWatermarked] = useState<ResultImage | null>(null); const [text, setText] = useState("FileXact"); const [position, setPosition] = useState<"center" | "bottomRight" | "bottomLeft" | "topRight" | "topLeft">("bottomRight"); const [watermarkStyle, setWatermarkStyle] = useState<WatermarkStyle>("stamp"); const [opacity, setOpacity] = useState(55); const [fontSize, setFontSize] = useState(42); const [busy, setBusy] = useState(false); const fileRef = useRef<HTMLInputElement | null>(null);
  const handleFiles = async (files?: FileList | null) => { const [next] = await readFiles(files); if (next) setItem(next); setWatermarked(null); };
  const preview = () => { const txt = text || "워터마크"; const fs = Math.max(16, Math.round(fontSize / 2)); if (watermarkStyle === "diagonalBand") return <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[155%] -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] justify-center bg-black/30 py-4" style={{ opacity: opacity / 100 }}><span className="font-black text-white" style={{ fontSize: fs }}>{txt}</span></div>; if (watermarkStyle === "horizontalBand") return <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[155%] -translate-x-1/2 -translate-y-1/2 justify-center bg-black/30 py-4" style={{ opacity: opacity / 100 }}><span className="font-black text-white" style={{ fontSize: fs }}>{txt}</span></div>; if (watermarkStyle === "repeat") return <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: opacity / 100 }}>{Array.from({ length: 24 }).map((_, i) => <span key={i} className="absolute -rotate-[24deg] font-black text-white drop-shadow" style={{ left: `${(i % 4) * 32 - 18}%`, top: `${Math.floor(i / 4) * 20 - 14}%`, fontSize: Math.max(12, Math.round(fontSize / 2.7)) }}>{txt}</span>)}</div>; const cls = position === "center" ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : position === "bottomRight" ? "bottom-6 right-6" : position === "bottomLeft" ? "bottom-6 left-6" : position === "topRight" ? "right-6 top-6" : "left-6 top-6"; return <span className={`pointer-events-none absolute rounded-xl bg-black/20 px-3 py-1 font-black text-white shadow ${cls}`} style={{ opacity: opacity / 100, fontSize: fs }}>{txt}</span>; };
  const apply = async () => { if (!item) return; setBusy(true); setWatermarked(await watermarkOneImage(item, text, position, opacity, fontSize, watermarkStyle)); setBusy(false); };
  if (!item) return <ToolLayout goHome={goHome} side={<div><h2 className="text-center text-2xl font-black">워터마크 설정</h2></div>}><UploadBox title="워터마크 넣기" desc="이미지 전체에 대각선 띠, 가로띠, 반복 패턴, 위치형 텍스트 워터마크를 적용합니다." icon={<ShieldCheck size={46} />} onFiles={handleFiles} /></ToolLayout>;
  return <ToolLayout goHome={goHome} side={<div className="space-y-5"><h2 className="text-center text-2xl font-black">워터마크 설정</h2><SidebarPreview title="워터마크 미리보기" items={[item]} /><div><label className="mb-2 block font-black">워터마크 문구</label><input value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-2xl border px-4 py-3" /></div><div><p className="mb-2 font-black">스타일</p><div className="grid grid-cols-2 gap-2">{[["stamp", "기본 텍스트"], ["diagonalBand", "전체 대각선 띠"], ["repeat", "전체 반복"], ["horizontalBand", "전체 가로띠"]].map(([value, label]) => <button key={value} onClick={() => setWatermarkStyle(value as WatermarkStyle)} className={`rounded-2xl border px-3 py-2 font-black ${watermarkStyle === value ? "border-blue-500 bg-blue-50" : "bg-white"}`}>{label}</button>)}</div></div>{watermarkStyle === "stamp" && <div><p className="mb-2 font-black">위치</p><div className="grid grid-cols-2 gap-2">{[["center", "가운데"], ["bottomRight", "오른쪽 아래"], ["bottomLeft", "왼쪽 아래"], ["topRight", "오른쪽 위"], ["topLeft", "왼쪽 위"]].map(([value, label]) => <button key={value} onClick={() => setPosition(value as any)} className={`rounded-2xl border px-3 py-2 font-black ${position === value ? "border-blue-500 bg-blue-50" : "bg-white"}`}>{label}</button>)}</div></div>}{[["투명도", opacity, setOpacity, 10, 100], ["글자 크기", fontSize, setFontSize, 18, 120]].map(([label, value, setter, min, max]) => <div key={label as string}><div className="mb-2 flex justify-between font-black"><span>{label as string}</span><span>{value as number}{label === "투명도" ? "%" : "px"}</span></div><input type="range" min={min as number} max={max as number} value={value as number} onChange={(e) => (setter as any)(Number(e.target.value))} className="w-full" /></div>)}<button onClick={apply} disabled={busy} className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white">{busy ? "적용 중..." : "워터마크 적용"}</button></div>}><ToolHeader title="워터마크 넣기" sub={`${item.file.name} · ${item.width}×${item.height}`} onAdd={() => fileRef.current?.click()} /><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} /><div className="grid gap-5 xl:grid-cols-2"><div className="rounded-3xl bg-white p-4"><p className="mb-3 font-black">원본 이미지</p><img src={item.previewUrl} className="h-[520px] w-full rounded-2xl bg-slate-50 object-contain" /></div><div className="rounded-3xl bg-white p-4"><p className="mb-3 font-black">워터마크 미리보기</p><div className="relative flex h-[520px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50"><img src={item.previewUrl} className="max-h-full max-w-full object-contain" />{preview()}</div>{watermarked && <a href={watermarked.url} download={watermarked.downloadName} className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">워터마크 이미지 다운로드</a>}</div></div></ToolLayout>;
}

function PrivacyBlurScreen({ goHome }: { goHome: () => void }) {
  const [item, setItem] = useState<UploadedImage | null>(null); const [blurred, setBlurred] = useState<ResultImage | null>(null); const [boxes, setBoxes] = useState<BlurBox[]>([{ id: makeId(), x: 58, y: 38, width: 24, height: 18 }]); const [activeId, setActiveId] = useState(""); const [blurStrength, setBlurStrength] = useState(12); const [busy, setBusy] = useState(false); const fileRef = useRef<HTMLInputElement | null>(null); const previewRef = useRef<HTMLDivElement | null>(null); const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; box: BlurBox } | null>(null); const active = boxes.find((b) => b.id === activeId) || boxes[0];
  const handleFiles = async (files?: FileList | null) => { const [next] = await readFiles(files); if (next) setItem(next); setBlurred(null); };
  const addBox = () => { const b = { id: makeId(), x: 38, y: 38, width: 24, height: 18 }; setBoxes((p) => [...p, b]); setActiveId(b.id); };
  const update = (id: string, patch: Partial<BlurBox>) => setBoxes((p) => p.map((b) => b.id === id ? { ...b, ...patch, x: Math.min(95, Math.max(0, patch.x ?? b.x)), y: Math.min(95, Math.max(0, patch.y ?? b.y)), width: Math.min(100, Math.max(5, patch.width ?? b.width)), height: Math.min(100, Math.max(5, patch.height ?? b.height)) } : b));
  const startDrag = (e: React.MouseEvent<HTMLDivElement>, box: BlurBox, mode: "move" | "resize") => { e.preventDefault(); e.stopPropagation(); setActiveId(box.id); dragRef.current = { id: box.id, mode, startX: e.clientX, startY: e.clientY, box }; const move = (ev: MouseEvent) => { const s = dragRef.current; const rect = previewRef.current?.getBoundingClientRect(); if (!s || !rect) return; const dx = ((ev.clientX - s.startX) / rect.width) * 100; const dy = ((ev.clientY - s.startY) / rect.height) * 100; if (s.mode === "move") update(s.id, { x: Math.min(100 - s.box.width, Math.max(0, s.box.x + dx)), y: Math.min(100 - s.box.height, Math.max(0, s.box.y + dy)) }); else update(s.id, { width: Math.min(100 - s.box.x, Math.max(5, s.box.width + dx)), height: Math.min(100 - s.box.y, Math.max(5, s.box.height + dy)) }); }; const up = () => { dragRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); };
  const apply = async () => { if (!item) return; setBusy(true); setBlurred(await blurOneImage(item, boxes, blurStrength)); setBusy(false); };
  if (!item) return <ToolLayout goHome={goHome} side={<div><h2 className="text-center text-2xl font-black">가리기 설정</h2></div>}><UploadBox title="개인정보 가리기" desc="가릴 박스를 직접 드래그하고 크기를 조절해 민감한 영역을 블러 처리합니다." icon={<Lock size={46} />} onFiles={handleFiles} /></ToolLayout>;
  return <ToolLayout goHome={goHome} side={<div className="space-y-5"><h2 className="text-center text-2xl font-black">가리기 설정</h2><SidebarPreview title="가리기 미리보기" items={[item]} /><button onClick={addBox} className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-black text-white">+ 가릴 박스 추가</button>{active && <div className="rounded-2xl border p-3"><p className="mb-3 font-black">선택 박스 세부 조절</p><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold">가로 %<input value={Math.round(active.width)} onChange={(e) => update(active.id, { width: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label><label className="text-xs font-bold">세로 %<input value={Math.round(active.height)} onChange={(e) => update(active.id, { height: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label></div></div>}<div><div className="mb-2 flex justify-between font-black"><span>흐림 강도</span><span>{blurStrength}px</span></div><input type="range" min={4} max={32} value={blurStrength} onChange={(e) => setBlurStrength(Number(e.target.value))} className="w-full" /></div><button onClick={apply} disabled={busy} className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white">{busy ? "처리 중..." : "개인정보 가리기"}</button></div>}><ToolHeader title="개인정보 가리기" sub={`${item.file.name} · ${item.width}×${item.height}`} onAdd={() => fileRef.current?.click()} /><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} /><div className="grid gap-5 xl:grid-cols-2"><div className="rounded-3xl bg-white p-4"><p className="mb-3 font-black">원본 이미지</p><img src={item.previewUrl} className="h-[520px] w-full rounded-2xl bg-slate-50 object-contain" /></div><div className="rounded-3xl bg-white p-4"><div className="mb-3 flex justify-between"><p className="font-black">블러 영역 편집</p><button onClick={addBox} className="rounded-full bg-blue-600 px-3 py-2 text-xs font-black text-white">+ 박스 추가</button></div><div ref={previewRef} className="relative flex h-[520px] select-none items-center justify-center overflow-hidden rounded-2xl bg-slate-50"><img src={item.previewUrl} className="max-h-full max-w-full object-contain" />{boxes.map((box, index) => <div key={box.id} onMouseDown={(e) => startDrag(e, box, "move")} className={`absolute cursor-move rounded-2xl border-2 border-dashed backdrop-blur-md ${active?.id === box.id ? "border-blue-600 bg-blue-500/25" : "border-blue-400 bg-blue-400/20"}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}><span className="absolute -left-2 -top-2 rounded-full bg-blue-600 px-2 py-1 text-xs font-black text-white">{index + 1}</span><button onClick={(e) => { e.stopPropagation(); setBoxes((p) => p.length > 1 ? p.filter((v) => v.id !== box.id) : p); }} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg font-black text-red-600 shadow">×</button><div onMouseDown={(e) => startDrag(e, box, "resize")} className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl-xl bg-blue-600" /></div>)}</div>{blurred && <a href={blurred.url} download={blurred.downloadName} className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">가린 이미지 다운로드</a>}</div></div></ToolLayout>;
}

function SimplePage({ title, goHome }: { title: string; goHome: () => void }) {
  const isPrivacy = title === "개인정보처리방침";
  const isTerms = title === "이용약관";
  const isContact = title === "문의하기";

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-10 md:py-14">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-10">
        <BackButton goHome={goHome} />

        <div className="border-b pb-6">
          <p className="text-sm font-black text-blue-600">FileXact Policy</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-slate-500 md:text-base">
            FileXact MVP 운영 기준에 맞춘 기본 안내입니다. 정식 배포 전 실제 운영자 정보와 문의 이메일을 확정해 반영하세요.
          </p>
        </div>

        {isPrivacy && (
          <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600 md:text-base md:leading-8">
            <PolicyBlock
              heading="1. 개인정보 처리 원칙"
              body="FileXact는 이미지 압축, 크기 조절, PDF 변환 등 제출용 파일 정리를 돕는 온라인 도구입니다. MVP 단계에서는 사용자가 선택한 이미지 파일을 가능한 한 사용자의 브라우저 안에서 처리하는 구조를 우선 적용합니다."
            />
            <PolicyBlock
              heading="2. 수집하는 개인정보"
              body="회원가입 없이 사용하는 기본 도구에서는 이름, 연락처, 주민등록번호 등 개인을 직접 식별할 수 있는 정보를 의도적으로 수집하지 않습니다. 단, 사용자가 문의하기 기능을 통해 이메일, 이름, 문의 내용을 제출하는 경우 해당 정보가 문의 응대 목적으로 처리될 수 있습니다."
            />
            <PolicyBlock
              heading="3. 이미지 및 파일 처리"
              body="사용자가 업로드하거나 선택한 이미지는 기능 실행을 위해 브라우저에서 읽힐 수 있습니다. 정식 서버 업로드 기능, 계정 저장 기능, 클라우드 보관 기능을 추가하는 경우 파일 저장 위치, 보관 기간, 삭제 방법을 별도로 고지합니다."
            />
            <PolicyBlock
              heading="4. 이용 목적"
              body="수집된 정보가 있는 경우 서비스 제공, 오류 확인, 문의 응대, 서비스 개선, 부정 이용 방지 목적으로만 사용합니다. 목적 외 이용이 필요한 경우 별도 동의를 받습니다."
            />
            <PolicyBlock
              heading="5. 보관 및 삭제"
              body="문의 응대를 위해 수집된 정보는 처리 완료 후 필요한 기간 동안 보관될 수 있으며, 관계 법령 또는 운영상 필요 기간이 종료되면 지체 없이 삭제합니다. 브라우저에서 처리되는 파일은 사용자의 기기와 브라우저 환경에 따라 임시로 유지될 수 있으므로 작업 완료 후 다운로드 파일과 브라우저 탭을 직접 관리해 주세요."
            />
            <PolicyBlock
              heading="6. 제3자 제공 및 위탁"
              body="FileXact는 법령에 근거한 경우를 제외하고 사용자의 개인정보를 제3자에게 제공하지 않습니다. 향후 결제, 광고, 분석, 이메일 발송 등 외부 서비스를 연동하는 경우 관련 내용을 본 방침에 반영합니다."
            />
            <PolicyBlock
              heading="7. 이용자 권리"
              body="사용자는 본인의 개인정보에 대해 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다. 문의 채널이 확정되면 해당 이메일 또는 문의 양식을 통해 요청할 수 있습니다."
            />
            <PolicyNotice />
          </div>
        )}

        {isTerms && (
          <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600 md:text-base md:leading-8">
            <PolicyBlock
              heading="1. 목적"
              body="본 약관은 FileXact가 제공하는 이미지 및 PDF 관련 온라인 도구의 이용 조건과 절차, 이용자와 서비스 운영자의 권리·의무를 정하는 것을 목적으로 합니다."
            />
            <PolicyBlock
              heading="2. 서비스 내용"
              body="FileXact는 이미지 압축, 이미지 크기 조절, 이미지 잘라내기, JPG 변환, 이미지 PDF 변환, 간단 편집, 워터마크, 개인정보 가리기 등 파일 정리 기능을 제공합니다. 일부 기능은 MVP 단계에서 제공 범위가 제한될 수 있습니다."
            />
            <PolicyBlock
              heading="3. 이용자의 책임"
              body="이용자는 본인이 권리를 보유했거나 사용할 권한이 있는 파일만 업로드 또는 처리해야 합니다. 타인의 개인정보, 저작물, 기밀자료를 무단으로 처리하거나 배포하여 발생하는 책임은 이용자에게 있습니다."
            />
            <PolicyBlock
              heading="4. 결과물 확인"
              body="FileXact는 제출용 파일 정리를 돕는 도구이며, 각 기관·사이트의 접수 기준을 보장하지 않습니다. 이용자는 다운로드한 결과물의 용량, 해상도, 파일 형식, 개인정보 가림 여부를 제출 전 직접 확인해야 합니다."
            />
            <PolicyBlock
              heading="5. 서비스 변경 및 중단"
              body="운영자는 기능 개선, 오류 수정, 보안 점검, 배포 작업을 위해 서비스 일부 또는 전체를 변경하거나 일시 중단할 수 있습니다. 중요한 변경 사항은 가능한 범위에서 사전에 안내합니다."
            />
            <PolicyBlock
              heading="6. 금지 행위"
              body="서비스 장애를 유발하는 자동화 요청, 악성 파일 처리, 타인의 권리를 침해하는 파일 변환, 법령에 위반되는 목적의 이용은 금지됩니다."
            />
            <PolicyBlock
              heading="7. 면책"
              body="FileXact는 무료 MVP 도구로 제공되는 범위에서 기능의 정확성과 지속성을 개선하기 위해 노력합니다. 다만 이용자의 파일 제출 실패, 원본 파일 손상, 잘못된 설정값 적용, 제출 기관 기준 변경으로 인한 손해에 대해서는 책임을 지지 않습니다."
            />
            <PolicyNotice />
          </div>
        )}

        {isContact && (
          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.2fr]">
            <div className="rounded-3xl bg-slate-50 p-5">
              <h2 className="text-xl font-black">문의 전 확인해주세요</h2>
              <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                <p>기능 오류를 문의할 때는 사용한 브라우저, 파일 형식, 오류 화면 캡처를 함께 남기면 확인이 빠릅니다.</p>
                <p>개인정보가 포함된 원본 이미지는 문의 내용에 직접 첨부하지 않는 것을 권장합니다.</p>
                <p>정식 배포 전에는 아래 이메일 주소를 실제 운영자 이메일로 교체하세요.</p>
              </div>
            </div>

            <div className="rounded-3xl border p-5">
              <h2 className="text-xl font-black">문의하기</h2>
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-black">
                  이메일
                  <input className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="reply@example.com" />
                </label>
                <label className="block text-sm font-black">
                  문의 유형
                  <select className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-blue-500">
                    <option>기능 오류</option>
                    <option>기능 제안</option>
                    <option>개인정보/약관 문의</option>
                    <option>기타 문의</option>
                  </select>
                </label>
                <label className="block text-sm font-black">
                  문의 내용
                  <textarea className="mt-2 min-h-40 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="문의 내용을 입력해 주세요." />
                </label>
                <button
                  type="button"
                  onClick={() => alert("MVP 단계에서는 실제 문의 전송 기능이 연결되어 있지 않습니다. 배포 전 이메일 또는 폼 서비스와 연결하세요.")}
                  className="w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-700"
                >
                  문의 보내기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PolicyBlock({ heading, body }: { heading: string; body: string }) {
  return (
    <article>
      <h2 className="text-lg font-black text-slate-950 md:text-xl">{heading}</h2>
      <p className="mt-3">{body}</p>
    </article>
  );
}

function PolicyNotice() {
  return (
    <div className="rounded-3xl bg-blue-50 p-5 text-sm font-bold leading-7 text-blue-700">
      본 문서는 MVP 배포 준비용 초안입니다. 사업자 정보, 운영자 이메일, 실제 서버 저장 여부, 광고·분석 도구 사용 여부가 확정되면 내용도 함께 수정해야 합니다.
    </div>
  );
}

export default App;
