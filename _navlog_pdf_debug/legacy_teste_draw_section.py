1540:     for canonical, aliases in PDF_ALIASES.items():
1541:         value = data.get(canonical)
1542:         if value in {None, ""}:
1543:             for alias in aliases:
1544:                 value = data.get(alias, norm_map.get(pdf_key_norm(alias)))
1545:                 if value not in {None, ""}:
1546:                     break
1547:         if value is not None:
1548:             output[canonical] = value
1549:             for alias in aliases:
1550:                 output[alias] = value
1551:                 output[pdf_key_norm(alias)] = value
1552:     for k, v in list(output.items()):
1553:         output[pdf_key_norm(k)] = v
1554:     return output
1555: 
1556: 
1557: def pdf_page_size(page: Any) -> Tuple[float, float]:
1558:     media_box = page.MediaBox
1559:     return float(media_box[2]) - float(media_box[0]), float(media_box[3]) - float(media_box[1])
1560: 
1561: 
1562: def pdf_text_lines(text: str, width: float, size: float, max_lines: int = 3) -> List[str]:
1563:     raw_lines = str(text).splitlines() or [str(text)]
1564:     max_chars = max(3, int(width / max(size * 0.52, 1)))
1565:     lines: List[str] = []
1566:     for raw in raw_lines:
1567:         raw = raw.strip()
1568:         if not raw:
1569:             lines.append("")
1570:             continue
1571:         while len(raw) > max_chars and len(lines) < max_lines:
1572:             cut = raw.rfind(" ", 0, max_chars)
1573:             if cut < max_chars * 0.45:
1574:                 cut = max_chars
1575:             lines.append(raw[:cut].strip())
1576:             raw = raw[cut:].strip()
1577:         if len(lines) < max_lines:
1578:             lines.append(raw)
1579:     if len(lines) > max_lines:
1580:         lines = lines[:max_lines]
1581:     return lines
1582: 
1583: 
1584: def pdf_font_size_for_field(name: str, value: str, rect: List[float]) -> float:
1585:     width = max(1.0, rect[2] - rect[0])
1586:     height = max(1.0, rect[3] - rect[1])
1587:     n = len(str(value).replace(chr(10), " "))
1588:     if "Waypoint" in name:
1589:         return 4.1 if n > 18 or chr(10) in str(value) else 4.8
1590:     if any(x in name for x in ["Navaid", "Identifier", "Frequency"]):
1591:         return 4.1 if n > 12 else 4.8
1592:     if name in {"ETD/ETA", "OBSERVATIONS", "CLEARANCES"}:
1593:         return 4.3 if n > 12 else 5.2
1594:     if width < 18 or height < 9:
1595:         return 4.2
1596:     if n > 10:
1597:         return 4.6
1598:     return 5.4
1599: 
1600: 
1601: def draw_pdf_field_text(canvas_obj: Any, name: str, rect: List[float], value: Any) -> None:
1602:     text = str(value or "")
1603:     if not text:
1604:         return
1605:     x1, y1, x2, y2 = [float(x) for x in rect]
1606:     width = max(1.0, x2 - x1)
1607:     height = max(1.0, y2 - y1)
1608:     size = pdf_font_size_for_field(name, text, [x1, y1, x2, y2])
1609:     max_lines = 3 if "Waypoint" in name else 2 if chr(10) in text else 1
1610:     if name in {"OBSERVATIONS", "CLEARANCES"}:
1611:         max_lines = max(2, int(height / max(size * 1.15, 1)))
1612:     lines = pdf_text_lines(text, width - 2.0, size, max_lines=max_lines)
1613:     line_h = size * 1.12
1614:     total_h = line_h * len(lines)
1615:     y = y1 + (height - total_h) / 2 + (len(lines) - 1) * line_h + size * 0.20
1616:     left_align = any(x in name for x in ["Waypoint", "OBSERVATIONS", "CLEARANCES", "Departure", "Arrival"])
1617: 
1618:     for line in lines:
1619:         is_plus = line.strip().startswith("+")
1620:         is_tod = "TOD" in line.strip().upper()
1621:         if is_plus:
1622:             canvas_obj.setFillColorRGB(0.72, 0.12, 0.12)
1623:         elif is_tod:
1624:             canvas_obj.setFillColorRGB(0.80, 0.08, 0.08)
1625:         else:
1626:             canvas_obj.setFillColorRGB(0, 0, 0)
1627:         canvas_obj.setFont("Helvetica-Bold", size)
1628:         if left_align:
1629:             canvas_obj.drawString(x1 + 1.2, y, line)
1630:         else:
1631:             canvas_obj.drawCentredString((x1 + x2) / 2, y, line)
1632:         y -= line_h
1633:     canvas_obj.setFillColorRGB(0, 0, 0)
1634: 
1635: 
1636: def stamp_non_field_navlog_headers(pdf: Any, data: Dict[str, Any], template: Path) -> None:
1637:     try:
1638:         from reportlab.pdfgen import canvas
1639:     except Exception:
1640:         return
1641:     values = {
1642:         "fl_alt": str(data.get("FLIGHT_LEVEL_ALTITUDE", "")),
1643:         "wind": str(data.get("WIND", "")),
1644:         "mag_var": str(data.get("MAG_VAR", "")),
1645:         "temp_isa": str(data.get("TEMP_ISA_DEV", "")),
1646:     }
1647:     if not any(values.values()):
1648:         return
1649:     for page_index, page in enumerate(pdf.pages):
1650:         page_width, page_height = pdf_page_size(page)
1651:         is_cont = page_index > 0 or "_1" in template.stem
1652:         ox = page_width / 2 if page_width > 650 and is_cont else 0
1653:         cw = min(421, page_width - ox)
1654:         y = 504 if is_cont else 367
1655:         packet = io.BytesIO()
1656:         c = canvas.Canvas(packet, pagesize=(page_width, page_height))
1657:         c.setFont("Helvetica-Bold", 5.2)
1658:         c.drawCentredString(ox + cw * 0.345, y, values["fl_alt"])
1659:         c.drawCentredString(ox + cw * 0.572, y, values["wind"])
1660:         c.drawCentredString(ox + cw * 0.766, y, values["mag_var"])
1661:         c.drawCentredString(ox + cw * 0.925, y, values["temp_isa"])
1662:         c.save()
1663:         packet.seek(0)
1664:         from pdfrw import PageMerge, PdfReader as _PdfReader
1665:         PageMerge(page).add(_PdfReader(packet).pages[0]).render()