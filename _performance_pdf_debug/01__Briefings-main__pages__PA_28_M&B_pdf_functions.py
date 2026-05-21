
# ===== 01__Briefings-main__pages__PA_28_M&B.py :: read_pdf_bytes 456-461 =====
0456: def read_pdf_bytes(paths) -> bytes:
0457:     for path_str in paths:
0458:         p = Path(path_str)
0459:         if p.exists():
0460:             return p.read_bytes()
0461:     raise FileNotFoundError(f"Template not found: {paths}")

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: get_field_names 463-481 =====
0463: def get_field_names(template_bytes: bytes) -> set:
0464:     names = set()
0465:     reader = PdfReader(io.BytesIO(template_bytes))
0466:     try:
0467:         fd = reader.get_fields()
0468:         if fd:
0469:             names.update(fd.keys())
0470:     except Exception:
0471:         pass
0472:     try:
0473:         for page in reader.pages:
0474:             if "/Annots" in page:
0475:                 for a in page["/Annots"]:
0476:                     obj = a.get_object()
0477:                     if obj.get("/T"):
0478:                         names.add(str(obj["/T"]))
0479:     except Exception:
0480:         pass
0481:     return names

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: fill_pdf 483-503 =====
0483: def fill_pdf(template_bytes: bytes, fields: dict) -> bytes:
0484:     reader = PdfReader(io.BytesIO(template_bytes))
0485:     writer = PdfWriter()
0486:     for p in reader.pages:
0487:         writer.add_page(p)
0488: 
0489:     root = reader.trailer["/Root"]
0490:     if "/AcroForm" not in root:
0491:         raise RuntimeError("Template PDF has no AcroForm.")
0492:     writer._root_object.update({NameObject("/AcroForm"): root["/AcroForm"]})
0493:     try:
0494:         writer._root_object["/AcroForm"].update({NameObject("/NeedAppearances"): BooleanObject(True)})
0495:     except Exception:
0496:         pass
0497: 
0498:     for page in writer.pages:
0499:         writer.update_page_form_field_values(page, fields)
0500: 
0501:     out = io.BytesIO()
0502:     writer.write(out)
0503:     return out.getvalue()

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: draw_cg_overlay_on_page0 552-600 =====
0552: def draw_cg_overlay_on_page0(template_bytes: bytes, points):
0553:     reader = PdfReader(io.BytesIO(template_bytes))
0554:     page0 = reader.pages[0]
0555:     w_pt = float(page0.mediabox.width)
0556:     h_pt = float(page0.mediabox.height)
0557: 
0558:     buf = io.BytesIO()
0559:     c = canvas.Canvas(buf, pagesize=(w_pt, h_pt))
0560: 
0561:     DOT_R = 5.5
0562:     for p in points:
0563:         cg = float(p["cg"])
0564:         wlb = float(p["w"])
0565:         r, g, b = p["rgb"]
0566: 
0567:         x_dot, y_dot = xy_from_cg_weight(cg, wlb)
0568:         x_base, y_base = xy_from_cg_weight(cg, 1200.0)
0569: 
0570:         c.setStrokeColorRGB(r, g, b)
0571:         c.setLineWidth(1.5)
0572:         c.line(x_base, y_base, x_dot, y_dot)
0573: 
0574:         c.setFillColorRGB(r, g, b)
0575:         c.circle(x_dot, y_dot, DOT_R, fill=1, stroke=0)
0576: 
0577:     c.showPage()
0578:     c.save()
0579:     buf.seek(0)
0580: 
0581:     overlay_pdf = PdfReader(buf)
0582:     overlay_page = overlay_pdf.pages[0]
0583: 
0584:     out_writer = PdfWriter()
0585:     for i, p in enumerate(reader.pages):
0586:         if i == 0:
0587:             p.merge_page(overlay_page)
0588:         out_writer.add_page(p)
0589: 
0590:     root = reader.trailer["/Root"]
0591:     if "/AcroForm" in root:
0592:         out_writer._root_object.update({NameObject("/AcroForm"): root["/AcroForm"]})
0593:         try:
0594:             out_writer._root_object["/AcroForm"].update({NameObject("/NeedAppearances"): BooleanObject(True)})
0595:         except Exception:
0596:             pass
0597: 
0598:     out = io.BytesIO()
0599:     out_writer.write(out)
0600:     return out.getvalue()

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: render_perf_pdf_to_image 643-649 =====
0643: def render_perf_pdf_to_image(pdf_bytes: bytes, page_index: int, zoom: float) -> Image.Image:
0644:     doc = fitz.open(stream=pdf_bytes, filetype="pdf")
0645:     page = doc.load_page(page_index)
0646:     pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
0647:     img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
0648:     doc.close()
0649:     return img

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: load_background_asset 651-660 =====
0651: def load_background_asset(mode: str, page_index: int = 0, zoom: float = 2.3) -> Image.Image:
0652:     info = ASSETS[mode]
0653:     p = _here(info["bg_default"])
0654:     if not p:
0655:         raise FileNotFoundError(f"Missing {info['bg_default']} in folder.")
0656: 
0657:     if info["bg_kind"] == "pdf":
0658:         return render_perf_pdf_to_image(p.read_bytes(), page_index=page_index, zoom=zoom)
0659: 
0660:     return Image.open(p).convert("RGB")

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: draw_path 919-924 =====
0919: def draw_path(draw: ImageDraw.ImageDraw, segs, color=(255, 140, 0), width=4):
0920:     for p1, p2 in segs:
0921:         draw.line([p1, p2], fill=color, width=width)
0922:     if segs:
0923:         x, y = segs[-1][1]
0924:         draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=color, outline=(255, 255, 255), width=2)

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: make_perf_image 926-931 =====
0926: def make_perf_image(bg: Image.Image, segs) -> Image.Image:
0927:     img = bg.copy()
0928:     d = ImageDraw.Draw(img)
0929:     if segs:
0930:         draw_path(d, segs)
0931:     return img

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: build_perf_2aerodromes_page 937-992 =====
0937: def build_perf_2aerodromes_page(pairs: List[Tuple[str, dict]]) -> bytes:
0938:     W, H = landscape(A4)
0939:     buf = io.BytesIO()
0940:     c = canvas.Canvas(buf, pagesize=(W, H))
0941: 
0942:     MARGIN   = 22
0943:     GAP_COL  = 10
0944:     GAP_ROW  = 18
0945:     ROW_LBL  = 14
0946:     N_COLS   = 3
0947:     COL_KEYS = ["takeoff_img", "climb_img", "landing_img"]
0948: 
0949:     n_rows = len(pairs)
0950:     usable_w = W - 2 * MARGIN
0951:     usable_h = H - 2 * MARGIN
0952: 
0953:     cell_w = (usable_w - GAP_COL * (N_COLS - 1)) / N_COLS
0954:     row_h  = (usable_h - GAP_ROW * (n_rows - 1)) / n_rows
0955:     img_h  = row_h - ROW_LBL
0956: 
0957:     top_y = H - MARGIN
0958: 
0959:     for ri, (label, info) in enumerate(pairs):
0960:         row_top = top_y - ri * (row_h + GAP_ROW)
0961:         row_bot = row_top - row_h
0962: 
0963:         c.setFillColorRGB(0.15, 0.15, 0.15)
0964:         c.setFont("Helvetica-Bold", 10)
0965:         c.drawString(MARGIN, row_top - ROW_LBL + 3, label)
0966: 
0967:         c.setStrokeColorRGB(0.65, 0.65, 0.65)
0968:         c.setLineWidth(0.4)
0969:         c.line(MARGIN, row_top - ROW_LBL, MARGIN + usable_w, row_top - ROW_LBL)
0970: 
0971:         for ci, col_key in enumerate(COL_KEYS):
0972:             cx = MARGIN + ci * (cell_w + GAP_COL)
0973:             cy = row_bot
0974: 
0975:             c.setStrokeColorRGB(0.80, 0.80, 0.80)
0976:             c.setLineWidth(0.3)
0977:             c.rect(cx, cy, cell_w, img_h)
0978: 
0979:             img = info.get(col_key)
0980:             if img is not None:
0981:                 iw, ih = img.size
0982:                 scale = min((cell_w - 2) / iw, (img_h - 2) / ih)
0983:                 dw, dh = iw * scale, ih * scale
0984:                 dx = cx + (cell_w - dw) / 2
0985:                 dy = cy + (img_h - dh) / 2
0986:                 c.drawImage(ImageReader(_img_to_jpeg_reader(img, quality=78)),
0987:                             dx, dy, width=dw, height=dh,
0988:                             preserveAspectRatio=True, mask="auto")
0989: 
0990:     c.showPage()
0991:     c.save()
0992:     return buf.getvalue()

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: append_perf_pages 1002-1020 =====
1002: def append_perf_pages(base_pdf_bytes: bytes, perf_by_role: dict) -> bytes:
1003:     reader = PdfReader(io.BytesIO(base_pdf_bytes))
1004:     writer = PdfWriter()
1005:     for p in reader.pages:
1006:         writer.add_page(p)
1007: 
1008:     order = ["DEPARTURE", "ARRIVAL", "ALTERNATE_1", "ALTERNATE_2"]
1009:     available = [(r, perf_by_role[r]) for r in order if r in perf_by_role]
1010: 
1011:     for i in range(0, len(available), 2):
1012:         chunk = available[i:i+2]
1013:         pairs = [(info.get("label", role.replace("_", " ").title()), info)
1014:                  for role, info in chunk]
1015:         page_bytes = build_perf_2aerodromes_page(pairs)
1016:         writer.add_page(PdfReader(io.BytesIO(page_bytes)).pages[0])
1017: 
1018:     out = io.BytesIO()
1019:     writer.write(out)
1020:     return out.getvalue()

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: _preprocess_pdf_for_raster 1034-1051 =====
1034: def _preprocess_pdf_for_raster(pdf_bytes: bytes) -> bytes:
1035:     try:
1036:         with fitz.open(stream=pdf_bytes, filetype="pdf") as d:
1037:             changed = False
1038:             for page in d:
1039:                 try:
1040:                     widgets = page.widgets()
1041:                     if widgets:
1042:                         for w in widgets:
1043:                             w.update()
1044:                             changed = True
1045:                 except Exception:
1046:                     pass
1047:             if changed:
1048:                 return d.tobytes(deflate=True, garbage=3)
1049:     except Exception:
1050:         pass
1051:     return pdf_bytes

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: _merge_side_by_side 1059-1088 =====
1059: def _merge_side_by_side(img_left: Image.Image, img_right: Image.Image, align_by="height", gap_px=0, bg=(255,255,255)) -> Image.Image:
1060:     if align_by == "width":
1061:         target = max(img_left.width, img_right.width)
1062:         if img_left.width != target:
1063:             h = int(round(img_left.height * (target / img_left.width)))
1064:             img_left = img_left.resize((target, h), Image.LANCZOS)
1065:         if img_right.width != target:
1066:             h = int(round(img_right.height * (target / img_right.width)))
1067:             img_right = img_right.resize((target, h), Image.LANCZOS)
1068:         H = max(img_left.height, img_right.height)
1069:         W = target * 2 + gap_px
1070:         canvas_img = Image.new("RGB", (W, H), bg)
1071:         canvas_img.paste(img_left, (0, (H - img_left.height) // 2))
1072:         canvas_img.paste(img_right, (target + gap_px, (H - img_right.height) // 2))
1073:         return canvas_img
1074: 
1075:     target = max(img_left.height, img_right.height)
1076:     if img_left.height != target:
1077:         w = int(round(img_left.width * (target / img_left.height)))
1078:         img_left = img_left.resize((w, target), Image.LANCZOS)
1079:     if img_right.height != target:
1080:         w = int(round(img_right.width * (target / img_right.height)))
1081:         img_right = img_right.resize((w, target), Image.LANCZOS)
1082: 
1083:     W = img_left.width + img_right.width + gap_px
1084:     H = target
1085:     canvas_img = Image.new("RGB", (W, H), bg)
1086:     canvas_img.paste(img_left, (0, 0))
1087:     canvas_img.paste(img_right, (img_left.width + gap_px, 0))
1088:     return canvas_img

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: mb_pdf_to_side_by_side_image 1090-1103 =====
1090: def mb_pdf_to_side_by_side_image(
1091:     pdf_bytes: bytes, dpi: int,
1092:     align_by="height", gap_px=0, bg=(255, 255, 255), sharpen=True,
1093: ) -> Image.Image:
1094:     pdf_bytes = _preprocess_pdf_for_raster(pdf_bytes)
1095:     with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
1096:         if doc.page_count < 1:
1097:             raise ValueError("PDF invalid (no pages).")
1098:         i1 = _render_page_rgb(doc.load_page(0), dpi, bg)
1099:         i2 = _render_page_rgb(doc.load_page(1), dpi, bg) if doc.page_count >= 2 else Image.new("RGB", i1.size, bg)
1100:         merged = _merge_side_by_side(i1, i2, align_by=align_by, gap_px=gap_px, bg=bg)
1101:         if sharpen:
1102:             merged = merged.filter(ImageFilter.UnsharpMask(radius=0.8, percent=120, threshold=3))
1103:         return merged

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: image_to_single_page_pdf 1105-1118 =====
1105: def image_to_single_page_pdf(img: Image.Image, dpi: int, jpeg_quality: int = 82) -> bytes:
1106:     w_px, h_px = img.size
1107:     w_pt = (w_px / dpi) * 72.0
1108:     h_pt = (h_px / dpi) * 72.0
1109:     jpeg_buf = io.BytesIO()
1110:     img.convert("RGB").save(jpeg_buf, format="JPEG", quality=jpeg_quality, optimize=True)
1111:     jpeg_buf.seek(0)
1112:     buf = io.BytesIO()
1113:     c = canvas.Canvas(buf, pagesize=(w_pt, h_pt))
1114:     c.drawImage(ImageReader(jpeg_buf), 0, 0, width=w_pt, height=h_pt,
1115:                 preserveAspectRatio=True, mask="auto")
1116:     c.showPage()
1117:     c.save()
1118:     return buf.getvalue()

# ===== 01__Briefings-main__pages__PA_28_M&B.py :: put 1830-1832 =====
1830:             def put(name, value):
1831:                 if name in fieldset:
1832:                     f[name] = value
