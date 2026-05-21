
# ===== 02__Briefings-main__pages__TECNAM_P2008_M&B.py :: read_pdf_bytes 1404-1409 =====
1404:     def read_pdf_bytes(paths) -> bytes:
1405:         for path_str in paths:
1406:             p = Path(path_str)
1407:             if p.exists():
1408:                 return p.read_bytes()
1409:         raise FileNotFoundError(f"Template not found in any known path: {paths}")

# ===== 02__Briefings-main__pages__TECNAM_P2008_M&B.py :: get_field_names 1411-1429 =====
1411:     def get_field_names(template_bytes: bytes) -> set:
1412:         names = set()
1413:         reader = PdfReader(io.BytesIO(template_bytes))
1414:         try:
1415:             fd = reader.get_fields()
1416:             if fd:
1417:                 names.update(fd.keys())
1418:         except Exception:
1419:             pass
1420:         try:
1421:             for page in reader.pages:
1422:                 if "/Annots" in page:
1423:                     for a in page["/Annots"]:
1424:                         obj = a.get_object()
1425:                         if obj.get("/T"):
1426:                             names.add(str(obj["/T"]))
1427:         except Exception:
1428:             pass
1429:         return names

# ===== 02__Briefings-main__pages__TECNAM_P2008_M&B.py :: put_any 1431-1436 =====
1431:     def put_any(out: dict, fieldset: set, keys, value: str):
1432:         if isinstance(keys, str):
1433:             keys = [keys]
1434:         for k in keys:
1435:             if k in fieldset:
1436:                 out[k] = value

# ===== 02__Briefings-main__pages__TECNAM_P2008_M&B.py :: fill_pdf 1438-1459 =====
1438:     def fill_pdf(template_bytes: bytes, fields: dict) -> bytes:
1439:         reader = PdfReader(io.BytesIO(template_bytes))
1440:         writer = PdfWriter()
1441:         for page in reader.pages:
1442:             writer.add_page(page)
1443: 
1444:         root = reader.trailer["/Root"]
1445:         if "/AcroForm" not in root:
1446:             raise RuntimeError("Template PDF has no AcroForm/fields.")
1447: 
1448:         writer._root_object.update({NameObject("/AcroForm"): root["/AcroForm"]})
1449:         try:
1450:             writer._root_object["/AcroForm"].update({NameObject("/NeedAppearances"): True})
1451:         except Exception:
1452:             pass
1453: 
1454:         for page in writer.pages:
1455:             writer.update_page_form_field_values(page, fields)
1456: 
1457:         bio = io.BytesIO()
1458:         writer.write(bio)
1459:         return bio.getvalue()

# ===== 02__Briefings-main__pages__TECNAM_P2008_M&B.py :: L_from_min 1512-1513 =====
1512:         def L_from_min(m):
1513:             return int(round(rate_pdf * ((m or 0) / 60.0)))
