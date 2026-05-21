
# ===== 05__Briefings-main__app.py :: image_bytes_to_pdf_bytes_fullbleed 76-97 =====
0076: def image_bytes_to_pdf_bytes_fullbleed(img_bytes: bytes, orientation: str = "L") -> bytes:
0077:     doc = FPDF(orientation=orientation, unit="mm", format="A4")
0078:     doc.add_page(orientation=orientation)
0079: 
0080:     img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
0081:     img = ImageOps.exif_transpose(img)
0082: 
0083:     max_w, max_h = doc.w, doc.h
0084:     iw, ih = img.size
0085:     r = min(max_w / iw, max_h / ih)
0086:     w, h = iw * r, ih * r
0087:     x, y = (doc.w - w) / 2.0, (doc.h - h) / 2.0
0088: 
0089:     with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
0090:         img.save(tmp, "PNG")
0091:         path = tmp.name
0092: 
0093:     doc.image(path, x=x, y=y, w=w, h=h)
0094:     os.remove(path)
0095: 
0096:     data = doc.output(dest="S")
0097:     return data if isinstance(data, (bytes, bytearray)) else str(data).encode("latin-1")

# ===== 05__Briefings-main__app.py :: fpdf_to_bytes 99-101 =====
0099: def fpdf_to_bytes(doc: FPDF) -> bytes:
0100:     data = doc.output(dest="S")
0101:     return data if isinstance(data, (bytes, bytearray)) else str(data).encode("latin-1")

# ===== 05__Briefings-main__app.py :: open_upload_as_pdf 106-116 =====
0106: def open_upload_as_pdf(upload, orientation_for_images="L") -> Optional[fitz.Document]:
0107:     if upload is None:
0108:         return None
0109:     raw = read_upload_bytes(upload)
0110:     if not raw:
0111:         return None
0112:     mime = (getattr(upload, "type", "") or "").lower()
0113:     if mime == "application/pdf":
0114:         return fitz.open(stream=raw, filetype="pdf")
0115:     ext_bytes = image_bytes_to_pdf_bytes_fullbleed(raw, orientation=orientation_for_images)
0116:     return fitz.open(stream=ext_bytes, filetype="pdf")

# ===== 05__Briefings-main__app.py :: add_back_to_index_badge 209-250 =====
0209: def add_back_to_index_badge(doc: fitz.Document):
0210:     for pno in range(1, doc.page_count):
0211:         page = doc.load_page(pno)
0212:         pw = page.rect.width
0213: 
0214:         margin_mm = 6.0
0215:         w_mm, h_mm = 9.5, 8.0
0216:         left = pw - mm_to_pt(margin_mm + w_mm)
0217:         top = mm_to_pt(margin_mm)
0218:         rect = fitz.Rect(left, top, left + mm_to_pt(w_mm), top + mm_to_pt(h_mm))
0219: 
0220:         stroke = (0.84, 0.87, 0.92)
0221:         fill = (0.98, 0.985, 1.0)
0222:         try:
0223:             page.draw_rect(
0224:                 rect,
0225:                 color=stroke, fill=fill, width=0.4,
0226:                 radius=mm_to_pt(1.2),
0227:                 fill_opacity=0.10, stroke_opacity=0.20
0228:             )
0229:         except Exception:
0230:             try:
0231:                 page.draw_rect(rect, color=stroke, fill=fill, width=0.3)
0232:             except Exception:
0233:                 pass
0234: 
0235:         pad = mm_to_pt(1.4)
0236:         col = (0.52, 0.56, 0.62)
0237:         width = 0.8
0238: 
0239:         y_mid = rect.y0 + rect.height * 0.55
0240:         x_right = rect.x1 - pad
0241:         x_head = rect.x0 + pad + mm_to_pt(2.6)
0242: 
0243:         page.draw_line(fitz.Point(x_right, y_mid), fitz.Point(x_head, y_mid), color=col, width=width)
0244:         head = mm_to_pt(2.2)
0245:         page.draw_line(fitz.Point(x_head, y_mid), fitz.Point(x_head + head, y_mid - head), color=col, width=width)
0246:         page.draw_line(fitz.Point(x_head, y_mid), fitz.Point(x_head + head, y_mid + head), color=col, width=width)
0247:         hook_h = mm_to_pt(2.0)
0248:         page.draw_line(fitz.Point(x_right, y_mid), fitz.Point(x_right, y_mid - hook_h), color=col, width=width * 0.85)
0249: 
0250:         page.insert_link({"kind": fitz.LINK_GOTO, "from": rect, "page": 0})

# ===== 05__Briefings-main__app.py :: insert_pdf_bytes 480-485 =====
0480: def insert_pdf_bytes(main_doc: fitz.Document, pdf_bytes: bytes) -> int:
0481:     start = main_doc.page_count
0482:     d = fitz.open(stream=pdf_bytes, filetype="pdf")
0483:     main_doc.insert_pdf(d, start_at=start)
0484:     d.close()
0485:     return start

# ===== 05__Briefings-main__app.py :: append_upload 487-494 =====
0487: def append_upload(main_doc: fitz.Document, upload) -> Optional[int]:
0488:     ext = open_upload_as_pdf(upload, orientation_for_images="L")
0489:     if not ext:
0490:         return None
0491:     start = main_doc.page_count
0492:     main_doc.insert_pdf(ext, start_at=start)
0493:     ext.close()
0494:     return start

# ===== 05__Briefings-main__app.py :: draw_header_band 128-132 =====
0128:     def draw_header_band(self, text: str):
0129:         self.set_draw_color(229, 231, 235)
0130:         self.set_line_width(0.3)
0131:         self.set_font("Helvetica", "B", 18)
0132:         self.cell(0, 12, text, ln=True, align="C", border="B")

# ===== 05__Briefings-main__app.py :: cover_with_numbered_index 134-195 =====
0134:     def cover_with_numbered_index(
0135:         self,
0136:         mission_no: str,
0137:         pilot: str,
0138:         aircraft: str,
0139:         callsign: str,
0140:         reg: str,
0141:         date_str: str,
0142:         time_utc: str,
0143:         items: List[Tuple[str, str]],
0144:     ) -> Dict[str, Tuple[float, float, float, float]]:
0145:         self.add_page(orientation="L")
0146: 
0147:         self.set_xy(0, 20)
0148:         self.set_font("Helvetica", "B", 32)
0149:         self.cell(0, 16, "Briefing", ln=True, align="C")
0150: 
0151:         self.set_font("Helvetica", "", 14)
0152:         info = []
0153:         if mission_no: info.append(f"Mission: {mission_no}")
0154:         if pilot: info.append(f"Pilot: {pilot}")
0155:         if aircraft: info.append(f"Aircraft: {aircraft}")
0156:         if callsign: info.append(f"Callsign: {callsign}")
0157:         if reg: info.append(f"Reg: {reg}")
0158:         if info:
0159:             self.cell(0, 9, "   ".join(info), ln=True, align="C")
0160:         if date_str or time_utc:
0161:             self.cell(0, 9, f"Date: {date_str}   UTC: {time_utc}", ln=True, align="C")
0162: 
0163:         self.ln(8)
0164:         self.set_font("Helvetica", "B", 16)
0165:         self.cell(0, 10, "Index", ln=True, align="C")
0166:         self.ln(2)
0167: 
0168:         rects_mm: Dict[str, Tuple[float, float, float, float]] = {}
0169: 
0170:         x_num = 35.0
0171:         x_lbl = 60.0
0172:         y = 80.0
0173:         step = 16.5
0174: 
0175:         for i, (key, label) in enumerate(items, start=1):
0176:             num = f"{i:02d}"
0177:             self.set_text_color(*PASTEL)
0178:             self.set_xy(x_num, y - 8)
0179:             self.set_font("Helvetica", "B", 28)
0180:             self.cell(0, 16, num, ln=0)
0181: 
0182:             self.set_text_color(15, 23, 42)
0183:             self.set_xy(x_lbl, y - 6)
0184:             self.set_font("Helvetica", "B", 18)
0185:             self.cell(0, 13, label, ln=1)
0186: 
0187:             self.set_draw_color(220, 224, 228)
0188:             self.set_line_width(0.3)
0189:             self.line(x_lbl, y + 6.5, x_lbl + 210.0, y + 6.5)
0190: 
0191:             rects_mm[key] = (x_lbl - 2.0, y - 7.0, 215.0, 14.0)
0192:             y += step
0193: 
0194:         self.set_text_color(0, 0, 0)
0195:         return rects_mm
