
# ===== 03__Briefings-main__pages__teste.py :: fmt_efob_pdf 235-237 =====
0235: def fmt_efob_pdf(liters: float) -> str:
0236:     # Formato compacto para caber na célula EFOB do template PDF.
0237:     return f"{fmt_unit(liters)}({int(round(liters_to_usg(liters)))})"

# ===== 03__Briefings-main__pages__teste.py :: pdf_time 252-257 =====
0252: def pdf_time(sec: float) -> str:
0253:     mins = int(round(float(sec) / 60.0))
0254:     if mins >= 60:
0255:         h, m = divmod(mins, 60)
0256:         return f"{h:02d}h{m:02d}"
0257:     return f"{mins:02d}:00"

# ===== 03__Briefings-main__pages__teste.py :: load_all_data 440-501 =====
0440: def load_all_data() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
0441:     ad = parse_ad_df(load_csv_safe(CSV_AD))
0442:     loc = parse_loc_df(load_csv_safe(CSV_LOC))
0443:     vor = load_vor(str(CSV_VOR)).copy()
0444: 
0445:     vor_points = pd.DataFrame()
0446:     if not vor.empty:
0447:         vor_points = pd.DataFrame({
0448:             "code": vor["ident"],
0449:             "name": vor["name"],
0450:             "lat": vor["lat"],
0451:             "lon": vor["lon"],
0452:             "alt": 0.0,
0453:             "src": "VOR",
0454:             "routes": "",
0455:             "remarks": vor["freq_mhz"].map(lambda x: f"{x:.2f} MHz"),
0456:         })
0457: 
0458:     ifr = load_csv_safe(CSV_IFR_POINTS).copy()
0459:     if not ifr.empty:
0460:         ifr = ifr.rename(columns={c: c.lower().strip() for c in ifr.columns})
0461:         if "code" not in ifr.columns and "ident" in ifr.columns:
0462:             ifr["code"] = ifr["ident"]
0463:         for col in ["name", "routes", "remarks", "src"]:
0464:             if col not in ifr.columns:
0465:                 ifr[col] = "IFR" if col == "src" else ""
0466:         if "alt" not in ifr.columns:
0467:             ifr["alt"] = 0.0
0468:         # Normaliza todos os pontos carregados deste CSV como IFR.
0469:         ifr["src"] = "IFR"
0470:         ifr["code"] = ifr["code"].astype(str).str.upper().str.strip()
0471:         ifr["name"] = ifr["name"].fillna(ifr["code"]).astype(str)
0472:         ifr["lat"] = pd.to_numeric(ifr["lat"], errors="coerce")
0473:         ifr["lon"] = pd.to_numeric(ifr["lon"], errors="coerce")
0474:         ifr = ifr.dropna(subset=["code", "lat", "lon"])[["code", "name", "lat", "lon", "alt", "src", "routes", "remarks"]]
0475: 
0476:     points = pd.concat([ad, loc, vor_points, ifr], ignore_index=True)
0477:     if points.empty:
0478:         points = pd.DataFrame(columns=["code", "name", "lat", "lon", "alt", "src", "routes", "remarks"])
0479:     points["code"] = points["code"].map(clean_code)
0480:     points["name"] = points["name"].fillna(points["code"]).astype(str)
0481:     points["lat"] = pd.to_numeric(points["lat"], errors="coerce")
0482:     points["lon"] = pd.to_numeric(points["lon"], errors="coerce")
0483:     points = points.dropna(subset=["lat", "lon"]).drop_duplicates(subset=["code", "lat", "lon", "src"]).reset_index(drop=True)
0484: 
0485:     airways = load_csv_safe(CSV_IFR_AIRWAYS).copy()
0486:     if not airways.empty:
0487:         airways = airways.rename(columns={c: c.lower().strip() for c in airways.columns})
0488:         for col in ["airway", "seq", "point", "lat", "lon"]:
0489:             if col not in airways.columns:
0490:                 airways[col] = None
0491:         for col in ["route_type", "lower", "upper", "mea", "remarks"]:
0492:             if col not in airways.columns:
0493:                 airways[col] = ""
0494:         airways["airway"] = airways["airway"].astype(str).str.upper().str.strip()
0495:         airways["point"] = airways["point"].astype(str).str.upper().str.strip()
0496:         airways["seq"] = pd.to_numeric(airways["seq"], errors="coerce")
0497:         airways["lat"] = pd.to_numeric(airways["lat"], errors="coerce")
0498:         airways["lon"] = pd.to_numeric(airways["lon"], errors="coerce")
0499:         airways = airways.dropna(subset=["airway", "seq", "point", "lat", "lon"]).sort_values(["airway", "seq"])
0500: 
0501:     return points, vor, airways

# ===== 03__Briefings-main__pages__teste.py :: pdf_key_norm 1525-1526 =====
1525: def pdf_key_norm(s: str) -> str:
1526:     return re.sub(r"[^A-Z0-9]", "", str(s).upper())

# ===== 03__Briefings-main__pages__teste.py :: expand_pdf_aliases 1537-1554 =====
1537: def expand_pdf_aliases(data: Dict[str, Any]) -> Dict[str, Any]:
1538:     output = data.copy()
1539:     norm_map = {pdf_key_norm(k): v for k, v in data.items()}
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

# ===== 03__Briefings-main__pages__teste.py :: pdf_page_size 1557-1559 =====
1557: def pdf_page_size(page: Any) -> Tuple[float, float]:
1558:     media_box = page.MediaBox
1559:     return float(media_box[2]) - float(media_box[0]), float(media_box[3]) - float(media_box[1])

# ===== 03__Briefings-main__pages__teste.py :: pdf_text_lines 1562-1581 =====
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

# ===== 03__Briefings-main__pages__teste.py :: pdf_font_size_for_field 1584-1598 =====
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

# ===== 03__Briefings-main__pages__teste.py :: draw_pdf_field_text 1601-1633 =====
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

# ===== 03__Briefings-main__pages__teste.py :: stamp_non_field_navlog_headers 1636-1665 =====
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

# ===== 03__Briefings-main__pages__teste.py :: stamp_pdf_form_values 1668-1688 =====
1668: def stamp_pdf_form_values(pdf: Any, data: Dict[str, Any]) -> None:
1669:     try:
1670:         from reportlab.pdfgen import canvas
1671:         from pdfrw import PageMerge, PdfReader as _PdfReader
1672:     except Exception:
1673:         return
1674:     for page in pdf.pages:
1675:         if not getattr(page, "Annots", None):
1676:             continue
1677:         page_width, page_height = pdf_page_size(page)
1678:         packet = io.BytesIO()
1679:         c = canvas.Canvas(packet, pagesize=(page_width, page_height))
1680:         for annot in page.Annots:
1681:             if annot.Subtype == PdfName("Widget") and annot.T and annot.Rect:
1682:                 key = str(annot.T)[1:-1]
1683:                 value = data.get(key, data.get(pdf_key_norm(key)))
1684:                 if value is not None and str(value) != "":
1685:                     draw_pdf_field_text(c, key, [float(x) for x in annot.Rect], value)
1686:         c.save()
1687:         packet.seek(0)
1688:         PageMerge(page).add(_PdfReader(packet).pages[0]).render()

# ===== 03__Briefings-main__pages__teste.py :: remove_pdf_widgets 1691-1703 =====
1691: def remove_pdf_widgets(pdf: Any) -> None:
1692:     for page in pdf.pages:
1693:         annots = getattr(page, "Annots", None)
1694:         if not annots:
1695:             continue
1696:         kept = []
1697:         for annot in annots:
1698:             if annot.Subtype != PdfName("Widget"):
1699:                 kept.append(annot)
1700:         if kept:
1701:             page.Annots = kept
1702:         else:
1703:             page.Annots = []

# ===== 03__Briefings-main__pages__teste.py :: fill_pdf 1706-1733 =====
1706: def fill_pdf(template: Path, output_path: Path, data: Dict[str, Any], pages_to_keep: Optional[int] = None) -> Path:
1707:     if PdfReader is None or PdfWriter is None or PdfDict is None or PdfName is None:
1708:         raise RuntimeError("pdfrw não está instalado.")
1709:     data = expand_pdf_aliases(data)
1710:     pdf = PdfReader(str(template))
1711:     if pages_to_keep is not None:
1712:         pdf.pages = pdf.pages[:max(1, int(pages_to_keep))]
1713:     if pdf.Root.AcroForm:
1714:         pdf.Root.AcroForm.update(PdfDict(NeedAppearances=True))
1715:     small_re = re.compile(r"(Waypoint|Navaid|Identifier|Frequency|Name|Lat|Long|Fix|ETA|OBSERVATIONS)", re.I)
1716:     for page in pdf.pages:
1717:         if not getattr(page, "Annots", None):
1718:             continue
1719:         for annot in page.Annots:
1720:             if annot.Subtype == PdfName("Widget") and annot.T:
1721:                 key = str(annot.T)[1:-1]
1722:                 value = data.get(key, data.get(pdf_key_norm(key)))
1723:                 if value is not None:
1724:                     annot.update(PdfDict(V=str(value), DV=str(value)))
1725:                     if small_re.search(key):
1726:                         annot.update(PdfDict(DA="/Helv 4 Tf 0 g"))
1727:     # Stamping torna os valores visíveis em leitores que ignoram NeedAppearances
1728:     # e permite texto pequeno/multilinha em fixes e ETD/ETA.
1729:     stamp_pdf_form_values(pdf, data)
1730:     stamp_non_field_navlog_headers(pdf, data, template)
1731:     remove_pdf_widgets(pdf)
1732:     PdfWriter(str(output_path), trailer=pdf).write()
1733:     return output_path

# ===== 03__Briefings-main__pages__teste.py :: aircraft_pdf_code 1749-1756 =====
1749: def aircraft_pdf_code(registration: str = "") -> str:
1750:     reg = clean_code(registration)
1751:     aircraft = str(st.session_state.get("aircraft_type", ""))
1752:     if reg.startswith("OE") or "Piper" in aircraft or "PA-28" in aircraft or "PA28" in aircraft:
1753:         return "PA28"
1754:     if reg.startswith("CS") or "Tecnam" in aircraft or "P2008" in aircraft or "P208" in aircraft:
1755:         return "P208"
1756:     return aircraft or ""

# ===== 03__Briefings-main__pages__teste.py :: pretty_pdf_waypoint_text 1772-1784 =====
1772: def pretty_pdf_waypoint_text(value: Any) -> str:
1773:     lines = [str(x).strip() for x in str(value or "").splitlines() if str(x).strip()]
1774:     if not lines:
1775:         return ""
1776:     first = lines[0]
1777:     first = first.replace("TURNTRK", " TURN T")
1778:     first = first.replace("TURN TRK", " TURN T")
1779:     first = first.replace("INTNSA", "INT NSA R")
1780:     first = first.replace("INT NSA", "INT NSA")
1781:     out = [first[:14]]
1782:     for line in lines[1:3]:
1783:         out.append(line[:14])
1784:     return chr(10).join(out)

# ===== 03__Briefings-main__pages__teste.py :: compact_pdf_waypoint 1787-1789 =====
1787: def compact_pdf_waypoint(point: Dict[str, Any]) -> str:
1788:     value = point.get("navlog_note") or point.get("code") or point.get("name")
1789:     return pretty_pdf_waypoint_text(value)

# ===== 03__Briefings-main__pages__teste.py :: fill_leg_payload 1820-1839 =====
1820: def fill_leg_payload(data: Dict[str, Any], idx: int, leg: Dict[str, Any], acc_d: float, acc_t: int, prefix: str = "Leg") -> None:
1821:     point = leg["B"]
1822:     has_hold = leg_hold_sec(leg) > 0
1823:     data[f"{prefix}{idx:02d}_Waypoint"] = compact_pdf_waypoint(point)
1824:     data[f"{prefix}{idx:02d}_Altitude_FL"] = str(int(round(float(point.get("alt", 0)))))
1825:     data[f"{prefix}{idx:02d}_True_Course"] = f"{int(round(leg['TC'])):03d}"
1826:     data[f"{prefix}{idx:02d}_True_Heading"] = f"{int(round(leg['TH'])):03d}"
1827:     data[f"{prefix}{idx:02d}_Magnetic_Heading"] = f"{int(round(leg['MH'])):03d}"
1828:     data[f"{prefix}{idx:02d}_True_Airspeed"] = str(int(round(leg["TAS"])))
1829:     data[f"{prefix}{idx:02d}_Ground_Speed"] = str(int(round(leg["GS"])))
1830:     data[f"{prefix}{idx:02d}_Leg_Distance"] = fmt_with_plus(f"{float(leg['Dist']):.1f}", f"{leg_hold_dist(leg):.1f}", has_hold)
1831:     data[f"{prefix}{idx:02d}_Cumulative_Distance"] = f"{acc_d:.1f}"
1832:     data[f"{prefix}{idx:02d}_Leg_ETE"] = fmt_with_plus(pdf_time(leg["time_sec"]), pdf_time(leg_hold_sec(leg)), has_hold)
1833:     data[f"{prefix}{idx:02d}_Cumulative_ETE"] = pdf_time(acc_t)
1834:     data[f"{prefix}{idx:02d}_ETO"] = ""
1835:     data[f"{prefix}{idx:02d}_Planned_Burnoff"] = fmt_with_plus(fmt_unit(leg["burn"]), fmt_unit(leg_hold_burn(leg)), has_hold)
1836:     data[f"{prefix}{idx:02d}_Estimated_FOB"] = fmt_efob_pdf(leg["efob_end"])
1837:     vor = choose_vor_for_point(point)
1838:     data[f"{prefix}{idx:02d}_Navaid_Identifier"] = format_vor_id(vor)
1839:     data[f"{prefix}{idx:02d}_Navaid_Frequency"] = format_radial_dist(vor, float(point["lat"]), float(point["lon"]))

# ===== 03__Briefings-main__pages__teste.py :: fill_total_payload 1842-1854 =====
1842: def fill_total_payload(data: Dict[str, Any], idx: int, total_dist: float, total_sec: int, total_burn: float, final_efob: float, prefix: str = "Leg") -> None:
1843:     data[f"{prefix}{idx:02d}_Waypoint"] = "TOTAL"
1844:     data[f"{prefix}{idx:02d}_Navaid_Identifier"] = ""
1845:     data[f"{prefix}{idx:02d}_Navaid_Frequency"] = ""
1846:     data[f"{prefix}{idx:02d}_Altitude_FL"] = ""
1847:     for field in ["True_Course", "True_Heading", "Magnetic_Heading", "True_Airspeed", "Ground_Speed"]:
1848:         data[f"{prefix}{idx:02d}_{field}"] = ""
1849:     data[f"{prefix}{idx:02d}_Leg_Distance"] = f"{total_dist:.1f}"
1850:     data[f"{prefix}{idx:02d}_Cumulative_Distance"] = f"{total_dist:.1f}"
1851:     data[f"{prefix}{idx:02d}_Leg_ETE"] = pdf_time(total_sec)
1852:     data[f"{prefix}{idx:02d}_Cumulative_ETE"] = pdf_time(total_sec)
1853:     data[f"{prefix}{idx:02d}_Planned_Burnoff"] = fmt_unit(total_burn)
1854:     data[f"{prefix}{idx:02d}_Estimated_FOB"] = fmt_efob_pdf(final_efob)

# ===== 03__Briefings-main__pages__teste.py :: build_pdf_payload 1857-1909 =====
1857: def build_pdf_payload(
1858:     legs: List[Dict[str, Any]],
1859:     header: Dict[str, str],
1860:     start: int = 0,
1861:     count: int = PDF_FULL_TEMPLATE_LEG_ROWS,
1862:     total_on_next_row: bool = False,
1863:     fill_continuation_total: bool = True,
1864: ) -> Dict[str, Any]:
1865:     chunk = legs[start:start + count]
1866:     total_sec = sum(leg_total_time_sec(leg) for leg in legs)
1867:     total_burn = rf(sum(leg_total_burn(leg) for leg in legs))
1868:     total_dist = rd(sum(leg_total_distance(leg) for leg in legs))
1869:     climb_sec = sum(leg_total_time_sec(leg) for leg in legs if leg["profile"] == "CLIMB")
1870:     level_sec = sum(leg_total_time_sec(leg) for leg in legs if leg["profile"] == "LEVEL")
1871:     desc_sec = sum(leg_total_time_sec(leg) for leg in legs if leg["profile"] == "DESCENT")
1872:     climb_burn = rf(sum(leg_total_burn(leg) for leg in legs if leg["profile"] == "CLIMB"))
1873:     final_efob = legs[-1]["efob_end"] if legs else float(st.session_state.start_efob)
1874:     data = {
1875:         "CALLSIGN": header.get("callsign", ""),
1876:         "AIRCRAFT": aircraft_pdf_code(header.get("registration", "")),
1877:         "AIRCRAFT_TYPE": aircraft_pdf_code(header.get("registration", "")),
1878:         "REGISTRATION": header.get("registration", ""),
1879:         "STUDENT": header.get("student", ""),
1880:         "LESSON": header.get("lesson", ""),
1881:         "INSTRUTOR": header.get("instructor", ""),
1882:         "DEPT": header.get("dept_freq", ""),
1883:         "ENROUTE": header.get("enroute_freq", ""),
1884:         "ARRIVAL": header.get("arrival_freq", ""),
1885:         "ETD/ETA": f"{header.get('etd', '')}/{header.get('eta', '')}".strip("/"),
1886:         "Departure_Airfield": str(st.session_state.wps[0].get("code") or st.session_state.wps[0].get("name")) if st.session_state.wps else "",
1887:         "Arrival_Airfield": str(st.session_state.wps[-1].get("code") or st.session_state.wps[-1].get("name")) if st.session_state.wps else "",
1888:         "WIND": f"{int(st.session_state.wind_from):03d}/{int(st.session_state.wind_kt):02d}",
1889:         "MAG_VAR": f"{fmt_num_clean(abs(float(st.session_state.mag_var)))}°{'E' if st.session_state.mag_is_east else 'W'}",
1890:         "FLIGHT_LEVEL_ALTITUDE": header.get("fl_alt", ""),
1891:         "TEMP_ISA_DEV": header.get("temp_isa", ""),
1892:         "FLT TIME": pdf_time(total_sec),
1893:         "CLIMB FUEL": fmt_fuel_l_usg(climb_burn),
1894:         "OBSERVATIONS": f"Climb {pdf_time(climb_sec)} / Cruise {pdf_time(level_sec)} / Descent {pdf_time(desc_sec)}",
1895:         "Leg_Number": str(len(legs)),
1896:         "AIRCRAFT_MODEL": str(st.session_state.aircraft_type),
1897:     }
1898:     acc_d = 0.0
1899:     acc_t = 0
1900:     start_idx = 1 if start == 0 else 12
1901:     for idx, leg in enumerate(chunk, start=start_idx):
1902:         acc_d = rd(acc_d + leg_total_distance(leg))
1903:         acc_t += int(leg_total_time_sec(leg))
1904:         fill_leg_payload(data, idx, leg, acc_d, acc_t)
1905:     if total_on_next_row and start == 0:
1906:         fill_total_payload(data, start_idx + len(chunk), total_dist, total_sec, total_burn, final_efob)
1907:     if fill_continuation_total:
1908:         fill_total_payload(data, PDF_TOTAL_ROW_INDEX, total_dist, total_sec, total_burn, final_efob)
1909:     return data

# ===== 03__Briefings-main__pages__teste.py :: legs_to_dataframe 1912-1949 =====
1912: def legs_to_dataframe(legs: List[Dict[str, Any]]) -> pd.DataFrame:
1913:     rows: List[Dict[str, Any]] = []
1914:     acc_d = 0.0
1915:     acc_t = 0
1916:     for leg in legs:
1917:         acc_d = rd(acc_d + leg_total_distance(leg))
1918:         acc_t += leg_total_time_sec(leg)
1919:         point = leg["B"]
1920:         vor = choose_vor_for_point(point)
1921:         to_label = point.get("navlog_note") or point.get("code") or point.get("name")
1922:         if point.get("calc_detail"):
1923:             to_label = f"{point.get('code')} · {point.get('calc_detail')}"
1924:         rows.append({
1925:             "Leg": leg["i"],
1926:             "From": leg["A"].get("code") or leg["A"].get("name"),
1927:             "To": to_label,
1928:             "Profile": leg["profile"],
1929:             "Alt": int(round(float(point.get("alt", 0)))),
1930:             "TC": f"{int(round(leg['TC'])):03d}",
1931:             "TH": f"{int(round(leg['TH'])):03d}",
1932:             "MH": f"{int(round(leg['MH'])):03d}",
1933:             "TAS": int(round(leg["TAS"])),
1934:             "GS": int(round(leg["GS"])),
1935:             "Dist": f"{float(leg['Dist']):.1f}",
1936:             "Hold Dist": f"+{leg_hold_dist(leg):.1f}" if leg_hold_sec(leg) else "",
1937:             "CumDist": f"{acc_d:.1f}",
1938:             "ETE": pdf_time(leg["time_sec"]),
1939:             "Hold ETE": f"+{pdf_time(leg_hold_sec(leg))}" if leg_hold_sec(leg) else "",
1940:             "CumETE": pdf_time(acc_t),
1941:             "Fuel": fmt_unit(leg["burn"]),
1942:             "Hold Fuel": f"+{fmt_unit(leg_hold_burn(leg))}" if leg_hold_sec(leg) else "",
1943:             "EFOB": fmt_efob_numbers(leg["efob_end"]),
1944:             "Wind": f"{int(leg['wind_from']):03d}/{int(leg['wind_kt'])}",
1945:             "VOR": format_vor_id(vor),
1946:             "Radial/Dist": format_radial_dist(vor, float(point["lat"]), float(point["lon"])),
1947:             "Tracking": leg.get("tracking", ""),
1948:         })
1949:     return pd.DataFrame(rows)

# ===== 03__Briefings-main__pages__teste.py :: make_base_map 2008-2030 =====
2008: def make_base_map() -> folium.Map:
2009:     # Arranca centrado em LPSO, com zoom suficiente para ver a zona de Ponte de Sor
2010:     # e grande parte de Portugal continental sem ficar demasiado afastado.
2011:     m = folium.Map(location=map_start_center(), zoom_start=8, tiles=None, control_scale=True, prefer_canvas=True)
2012:     folium.TileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", name="OSM", attr="© OpenStreetMap").add_to(m)
2013:     folium.TileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", name="OpenTopoMap", attr="© OpenTopoMap").add_to(m)
2014:     folium.TileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}", name="Hillshade", attr="© Esri").add_to(m)
2015:     # Não usar fit_bounds aqui; isso anulava o zoom inicial e abria o mapa demasiado afastado.
2016:     token = get_openaip_token()
2017:     if bool(st.session_state.get("show_openaip", True)) and token:
2018:         folium.TileLayer(
2019:             tiles="https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=" + token,
2020:             attr="© openAIP",
2021:             name="openAIP",
2022:             overlay=True,
2023:             control=True,
2024:             subdomains="abc",
2025:             opacity=float(st.session_state.get("openaip_opacity", 0.65)),
2026:             max_zoom=20,
2027:         ).add_to(m)
2028:     Fullscreen(position="topleft", title="Fullscreen").add_to(m)
2029:     MeasureControl(position="topleft", primary_length_unit="nautical_miles").add_to(m)
2030:     return m

# ===== 03__Briefings-main__pages__teste.py :: render_route_map 2037-2077 =====
2037: def render_route_map(wps: List[Dict[str, Any]], nodes: List[Dict[str, Any]], legs: List[Dict[str, Any]], key: str = "mainmap") -> Dict[str, Any]:
2038:     m = make_base_map()
2039:     if bool(st.session_state.show_ref_points):
2040:         cluster = MarkerCluster(name="Pontos IFR/VFR/VOR/PROC", disableClusteringAtZoom=10).add_to(m)
2041:         src_filter = set(st.session_state.ref_layers)
2042:         ref_all = point_catalog()
2043:         ref = ref_all[ref_all["src"].isin(src_filter)] if src_filter and not ref_all.empty else ref_all.head(0)
2044:         for _, r in ref.iterrows():
2045:             src = str(r.get("src"))
2046:             color = {"IFR": "#2563eb", "VOR": "#dc2626", "AD": "#111827", "VFR": "#16a34a", "PROC": "#9333ea"}.get(src, "#334155")
2047:             folium.CircleMarker((float(r["lat"]), float(r["lon"])), radius=4 if src in {"IFR", "VOR", "PROC"} else 3, color=color, weight=1, fill=True, fill_opacity=0.9, tooltip=f"[{src}] {r.get('code')} — {r.get('name')} {r.get('routes', '')}").add_to(cluster)
2048:     if bool(st.session_state.show_airways) and not AIRWAYS_DF.empty:
2049:         for airway, grp in AIRWAYS_DF.groupby("airway"):
2050:             pts = [(float(r["lat"]), float(r["lon"])) for _, r in grp.sort_values("seq").iterrows()]
2051:             if len(pts) >= 2:
2052:                 folium.PolyLine(pts, color="#64748b", weight=2, opacity=0.55, tooltip=airway).add_to(m)
2053:     for leg in legs:
2054:         if leg["profile"] == "STOP":
2055:             continue
2056:         color = PROFILE_COLORS.get(leg["profile"], "#7c3aed")
2057:         if leg.get("is_dme_arc"):
2058:             latlngs = dme_arc_polyline(leg["A"], leg["B"])
2059:         elif leg.get("is_turn"):
2060:             latlngs = turn_polyline(leg["A"], leg["B"])
2061:         else:
2062:             latlngs = [(leg["A"]["lat"], leg["A"]["lon"]), (leg["B"]["lat"], leg["B"]["lon"])]
2063:         folium.PolyLine(latlngs, color="#ffffff", weight=8, opacity=1).add_to(m)
2064:         folium.PolyLine(latlngs, color=color, weight=4, opacity=1, tooltip=f"L{leg['i']} {leg['profile']} {pdf_time(leg['time_sec'])}").add_to(m)
2065:     for idx, point in enumerate(wps, start=1):
2066:         lat, lon = float(point["lat"]), float(point["lon"])
2067:         src = point.get("src", "USER")
2068:         color = {"IFR": "#2563eb", "VOR": "#dc2626", "AD": "#111827", "VFR": "#16a34a", "USER": "#f97316", "VORFIX": "#be123c", "DMEARC": "#0891b2", "PROC": "#9333ea", "PROC_DYNAMIC": "#9333ea", "TURN": "#9333ea"}.get(src, "#0f172a")
2069:         folium.CircleMarker((lat, lon), radius=6, color="#fff", weight=3, fill=True, fill_opacity=1).add_to(m)
2070:         folium.CircleMarker((lat, lon), radius=5, color=color, fill=True, fill_opacity=1, tooltip=f"{idx}. {point.get('code') or point.get('name')} [{src}]").add_to(m)
2071:         label = point.get("navlog_note") or point.get("code") or point.get("name")
2072:         label_html = str(label).replace(chr(10), "<br><span style='font-size:10px;font-weight:700'>")
2073:         extra_close = "</span>" if chr(10) in str(label) else ""
2074:         label_color = "#be123c" if clean_code(point.get("code")) == "TOD" else "#0f172a"
2075:         add_div_marker(m, lat, lon, f"<div style='transform:translate(8px,-22px);font-weight:800;font-size:12px;color:{label_color};text-shadow:-1px -1px 0 white,1px -1px 0 white,-1px 1px 0 white,1px 1px 0 white;white-space:nowrap'>{idx}. {label_html}{extra_close}</div>")
2076:     folium.LayerControl(collapsed=False).add_to(m)
2077:     return st_folium(m, width=None, height=720, key=key)

# ===== 03__Briefings-main__pages__teste.py :: from_dict 176-183 =====
0176:     def from_dict(cls, data: Dict[str, Any]) -> "Point":
0177:         fields = cls.__dataclass_fields__.keys()
0178:         clean = {k: data.get(k) for k in fields if k in data}
0179:         clean.setdefault("code", str(data.get("code") or data.get("name") or "WP").upper())
0180:         clean.setdefault("name", str(data.get("name") or data.get("code") or "WP"))
0181:         clean.setdefault("lat", float(data.get("lat", 0.0)))
0182:         clean.setdefault("lon", float(data.get("lon", 0.0)))
0183:         return cls(**clean)
