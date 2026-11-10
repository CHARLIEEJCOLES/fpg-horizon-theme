"""Clean a table picture for OCR: shading and ruled lines removed, text left black on white."""
import cv2
import numpy as np
from PIL import Image


def clean(im, scale=3):
    g = np.array(im.convert('L'))
    g = cv2.resize(g, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    bw = (g < 150).astype(np.uint8) * 255  # ink; the pale blue shading is ~230 grey
    # Ruled lines: long thin runs of ink, found with long kernels and painted out.
    h = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(40, bw.shape[1] // 12), 1)))
    v = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(40, bw.shape[0] // 12))))
    lines = cv2.dilate(h | v, np.ones((3, 3), np.uint8))
    bw[lines > 0] = 0
    return Image.fromarray(255 - bw)
