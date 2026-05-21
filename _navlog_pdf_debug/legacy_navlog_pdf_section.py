1860: 
1861:     route_str = build_fpl_route(st.session_state.wps)
1862:     if route_str:
1863:         st.code(route_str.upper())
1864:     else:
1865:         st.info("Adiciona WPs e volta aqui para gerar a rota.")
1866: 
1867: # ========= NAVLOG / PDF =========
1868: st.markdown("<div class='sep'></div>", unsafe_allow_html=True)
1869: st.header("📄 NAVLOG — Cabeçalho & PDF")
1870: 
1871: REG_OPTIONS_TECNAM = ["CS-DHS","CS-DHT","CS-DHU","CS-DHV","CS-DHW","CS-ECC","CS-ECD"]
1872: REG_OPTIONS_PIPER  = ["OE-KPD","OE-KPE","OE-KPG","OE-KPP","OE-KPJ","OE-KPF"]
1873: 
1874: reg_options = (
1875:     REG_OPTIONS_PIPER
1876:     if "Piper" in st.session_state.aircraft_type
1877:     else REG_OPTIONS_TECNAM
1878: )
1879: 
1880: c0,c1,c2,c3,c4 = st.columns(5)
1881: with c0:
1882:     callsign = st.text_input("Callsign", "RVP")
1883: with c1:
1884:     registration = st.selectbox("Registration", reg_options, index=0)
1885: with c2:
1886:     student = st.text_input("Student", "AMOIT")
1887: with c3:
1888:     lesson = st.text_input("Lesson", "")
1889: with c4:
1890:     instructor = st.text_input("Instructor", "")
1891: 
1892: c5,c6,c7,c8,c9 = st.columns(5)
1893: with c5:
1894:     etd = st.text_input("ETD (HH:MM)", "")
1895: with c6:
1896:     eta = st.text_input("ETA (HH:MM, opcional)", "")
1897: with c7:
1898:     dept_freq = st.text_input("FREQ DEPT", "119.805")
1899: with c8:
1900:     enroute_freq = st.text_input("FREQ ENROUTE", "123.755")
1901: with c9:
1902:     arrival_freq = st.text_input("FREQ ARRIVAL", "131.675")
1903: 
1904: st.subheader("Alternate (opcional)")
1905: cA,cB,cC = st.columns([2,1,1])
1906: with cA:
1907:     alt_query = st.text_input("Pesquisar alternante (código/nome)", "")
1908: with cB:
1909:     alt_elev = st.number_input("Elevação ALT (ft)", 0, 10000, 350, step=10)
1910: with cC:
1911:     use_alt = st.checkbox("Usar este alternante", value=False)
1912: 
1913: alt_choice = None
1914: if alt_query.strip():
1915:     tql = alt_query.lower().strip()
1916:     cand = db[db.apply(lambda r: any(tql in str(v).lower() for v in r.values), axis=1)].head(1)
1917:     if not cand.empty:
1918:         r = cand.iloc[0]
1919:         alt_choice = {
1920:             "name": r.get("code") or r.get("name"),
1921:             "lat": float(r["lat"]),
1922:             "lon": float(r["lon"]),
1923:             "elev": int(alt_elev)
1924:         }
1925:         st.success(f"ALT: {alt_choice['name']}  ({alt_choice['lat']:.4f}, {alt_choice['lon']:.4f})")
1926:     else:
1927:         st.warning("Sem match para o alternante.")
1928: 
1929: alt_leg_info = None
1930: if use_alt and alt_choice and st.session_state.wps:
1931:     dest = st.session_state.wps[-1]
1932:     tc_alt = gc_course_tc(dest["lat"], dest["lon"], alt_choice["lat"], alt_choice["lon"])
1933:     if st.session_state.use_global_wind:
1934:         wf = st.session_state.wind_from
1935:         wk = st.session_state.wind_kt
1936:     else:
1937:         wf = dest.get("wind_from", st.session_state.wind_from)
1938:         wk = dest.get("wind_kt",   st.session_state.wind_kt)
1939:     _, th_alt, gs_alt = wind_triangle(tc_alt, get_cruise_tas(), wf, wk)
1940:     mh_alt = apply_var(th_alt, st.session_state.mag_var, st.session_state.mag_is_e)
1941:     dist_alt = rdist05(gc_dist_nm(dest["lat"], dest["lon"], alt_choice["lat"], alt_choice["lon"]))
1942:     ete_alt_sec = rt30((dist_alt / max(gs_alt,1e-9)) * 3600)
1943:     burn_alt = rfuel05(get_fuel_flow() * (ete_alt_sec/3600.0))
1944:     alt_leg_info = {
1945:         "tc":tc_alt,"th":th_alt,"mh":mh_alt,
1946:         "tas":get_cruise_tas(),"gs":gs_alt,
1947:         "dist":dist_alt,"ete":ete_alt_sec,
1948:         "burn":burn_alt
1949:     }
1950: 
1951: # ========= PDF helpers =========
1952: def _pdf_mmss(sec:int):
1953:     total_minutes = int(round(float(sec) / 60.0))
1954:     if total_minutes >= 60:
1955:         hours, mins = divmod(total_minutes, 60)
1956:         return f"{hours:02d}h{mins:02d}"
1957:     return f"{total_minutes:02d}:00"
1958: 
1959: def _fill_pdf(template_path: str, out_path: str, data: dict):
1960:     pdf = PdfReader(template_path)
1961:     if pdf.Root.AcroForm:
1962:         pdf.Root.AcroForm.update(PdfDict(NeedAppearances=True))
1963:     SMALL_FIELDS_PREFIXES = (
1964:         "Leg01_Navaid_", "Leg02_Navaid_", "Leg03_Navaid_",
1965:         "Leg04_Navaid_", "Leg05_Navaid_", "Leg06_Navaid_",
1966:         "Leg07_Navaid_", "Leg08_Navaid_", "Leg09_Navaid_",
1967:         "Leg10_Navaid_", "Leg11_Navaid_", "Leg12_Navaid_",
1968:         "Leg13_Navaid_", "Leg14_Navaid_", "Leg15_Navaid_",
1969:         "Leg16_Navaid_", "Leg17_Navaid_", "Leg18_Navaid_",
1970:         "Leg19_Navaid_", "Leg20_Navaid_", "Leg21_Navaid_",
1971:         "Leg22_Navaid_", "Leg23_Navaid_",
1972:     )
1973:     for page in pdf.pages:
1974:         if not getattr(page, "Annots", None):
1975:             continue
1976:         for a in page.Annots:
1977:             if a.Subtype == PdfName('Widget') and a.T:
1978:                 key = str(a.T)[1:-1]
1979:                 if key in data:
1980:                     a.update(PdfDict(V=str(data[key])))
1981:                     if key.startswith(SMALL_FIELDS_PREFIXES):
1982:                         a.update(PdfDict(DA="/Helv 5 Tf 0 g"))
1983:     PdfWriter(out_path, trailer=pdf).write()
1984:     return out_path
1985: 
1986: def _sum_time(legs, profile):
1987:     return sum(L["time_sec"] for L in legs if L["profile"]==profile)
1988: 
1989: def _sum_burn(legs, profile):
1990:     return rfuel05(sum(L["burn"] for L in legs if L["profile"]==profile))
1991: 
1992: def _choose_vor_for_point(P):
1993:     nm = str(P.get("name","")).upper()
1994:     if nm.startswith("TOC ") or nm.startswith("TOD "):
1995:         return None
1996:     if P.get("vor_pref") == "FIXED":
1997:         cand = (P.get("vor_ident") or P.get("name") or "").strip()
1998:         v = get_vor_by_ident(cand)
1999:         if v:
2000:             return v
2001:     return nearest_vor(float(P["lat"]), float(P["lon"]))
2002: 
2003: def _fill_leg_line(d:dict, idx:int, L:dict, use_point:str, acc_d:float, acc_t:int, prefix="Leg"):
2004:     P = L["B"] if use_point=="B" else L["A"]
2005:     d[f"{prefix}{idx:02d}_Waypoint"]            = str(P["name"])
2006:     d[f"{prefix}{idx:02d}_Altitude_FL"]         = str(int(round(P["alt"])))
2007:     if L["profile"] != "STOP":
2008:         d[f"{prefix}{idx:02d}_True_Course"]         = f"{int(round(L['TC'])):03d}"
2009:         d[f"{prefix}{idx:02d}_True_Heading"]        = f"{int(round(L['TH'])):03d}"
2010:         d[f"{prefix}{idx:02d}_Magnetic_Heading"]    = f"{int(round(L['MH'])):03d}"
2011:         d[f"{prefix}{idx:02d}_True_Airspeed"]       = str(int(round(L["TAS"])))
2012:         d[f"{prefix}{idx:02d}_Ground_Speed"]        = str(int(round(L["GS"])))
2013:         d[f"{prefix}{idx:02d}_Leg_Distance"]        = f"{L['Dist']:.1f}"
2014:     else:
2015:         d[f"{prefix}{idx:02d}_True_Course"]         = ""
2016:         d[f"{prefix}{idx:02d}_True_Heading"]        = ""
2017:         d[f"{prefix}{idx:02d}_Magnetic_Heading"]    = ""
2018:         d[f"{prefix}{idx:02d}_True_Airspeed"]       = ""
2019:         d[f"{prefix}{idx:02d}_Ground_Speed"]        = ""
2020:         d[f"{prefix}{idx:02d}_Leg_Distance"]        = "0.0"
2021:     d[f"{prefix}{idx:02d}_Cumulative_Distance"] = f"{acc_d:.1f}"
2022:     d[f"{prefix}{idx:02d}_Leg_ETE"]             = _pdf_mmss(L["time_sec"])
2023:     d[f"{prefix}{idx:02d}_Cumulative_ETE"]      = _pdf_mmss(acc_t)
2024:     d[f"{prefix}{idx:02d}_ETO"]                 = ""
2025:     d[f"{prefix}{idx:02d}_Planned_Burnoff"]     = f"{L['burn']:.1f}"
2026:     d[f"{prefix}{idx:02d}_Estimated_FOB"]       = f"{L['efob_end']:.1f}"
2027: 
2028:     try:
2029:         vor = _choose_vor_for_point(P)
2030:         if vor:
2031:             d[f"{prefix}{idx:02d}_Navaid_Identifier"] = fmt_ident_with_freq(vor)
2032:             d[f"{prefix}{idx:02d}_Navaid_Frequency"]  = fmt_radial_distance_from(vor, P["lat"], P["lon"])
2033:         else:
2034:             d[f"{prefix}{idx:02d}_Navaid_Identifier"] = ""
2035:             d[f"{prefix}{idx:02d}_Navaid_Frequency"]  = ""
2036:     except Exception:
2037:         d[f"{prefix}{idx:02d}_Navaid_Identifier"] = ""
2038:         d[f"{prefix}{idx:02d}_Navaid_Frequency"]  = ""
2039: 
2040: def _build_payloads_main(
2041:     legs, *,
2042:     callsign, registration, student, lesson, instructor,
2043:     dept, enroute, arrival, etd, eta,
2044:     fl_hdr="", temp_hdr="",
2045:     alt_info=None, alt_choice=None
2046: ):
2047:     total_sec = sum(L["time_sec"] for L in legs)
2048:     total_burn = rfuel05(sum(L["burn"] for L in legs))
2049:     total_dist = rdist05(sum(L["Dist"] for L in legs))
2050:     obs = (
2051:         f"Climb {_pdf_mmss(_sum_time(legs,'CLIMB'))} / "
2052:         f"Cruise {_pdf_mmss(_sum_time(legs,'LEVEL'))} / "
2053:         f"Descent {_pdf_mmss(_sum_time(legs,'DESCENT'))}"
2054:     )
2055:     climb_burn = _sum_burn(legs,'CLIMB')
2056: 
2057:     N = min(len(legs), 22)
2058:     legs_main = legs[:N]
2059:     d = {
2060:         "CALLSIGN": callsign,
2061:         "REGISTRATION": registration,
2062:         "STUDENT": student,
2063:         "LESSON": lesson,
2064:         "INSTRUTOR": instructor,
2065:         "DEPT": dept,
2066:         "ENROUTE": enroute,
2067:         "ARRIVAL": arrival,
2068:         "ETD/ETA": (f"{etd}/{eta}" if etd else ""),
2069:         "Departure_Airfield": str(st.session_state.wps[0]["name"]) if st.session_state.wps else "",
2070:         "Arrival_Airfield":   str(st.session_state.wps[-1]["name"]) if st.session_state.wps else "",
2071:         "WIND": f"{int(st.session_state.wind_from)}/{int(st.session_state.wind_kt)}",
2072:         "MAG_VAR": f"{abs(st.session_state.mag_var):.0f}°{'E' if st.session_state.mag_is_e else 'W'}",
2073:         "FLIGHT_LEVEL/ALTITUDE": fl_hdr,
2074:         "FLIGHT_LEVEL_ALTITUDE": fl_hdr,
2075:         "TEMP/ISA_DEV": temp_hdr,
2076:         "TEMP_ISA_DEV": temp_hdr,
2077:         "FLT TIME": _pdf_mmss(total_sec),
2078:         "CLIMB FUEL": f"{climb_burn:.1f}",
2079:         "OBSERVATIONS": obs,
2080:         "Leg_Number": str(len(legs)),
2081:         "AIRCRAFT_TYPE": st.session_state.aircraft_type,
2082:     }
2083: 
2084:     acc_d, acc_t = 0.0, 0
2085:     for i, L in enumerate(legs_main, start=1):
2086:         acc_d = rdist05(acc_d + L["Dist"])
2087:         acc_t += L["time_sec"]
2088:         _fill_leg_line(d, i, L, use_point="B", acc_d=acc_d, acc_t=acc_t)
2089: 
2090:     d["Leg23_Leg_Distance"] = f"{total_dist:.1f}"
2091:     d["Leg23_Leg_ETE"]      = _pdf_mmss(total_sec)
2092:     d["Leg23_Planned_Burnoff"] = f"{total_burn:.1f}"
2093:     d["Leg23_Estimated_FOB"]   = f"{legs[-1]['efob_end']:.1f}"
2094: 
2095:     if alt_info and alt_choice:
2096:         d.update({
2097:             "Alternate_Airfield":alt_choice["name"],
2098:             "Alternate_Elevation":str(int(alt_choice["elev"])),
2099:             "Alternate_True_Course":f"{int(round(alt_info['tc'])):03d}",
2100:             "Alternate_True_Heading":f"{int(round(alt_info['th'])):03d}",
2101:             "Alternate_Magnetic_Heading":f"{int(round(alt_info['mh'])):03d}",
2102:             "Alternate_True_Airspeed":str(int(round(alt_info['tas']))),
2103:             "Alternate_Ground_Speed":str(int(round(alt_info['gs']))),
2104:             "Alternate_Leg_Distance":f"{alt_info['dist']:.1f}",
2105:             "Alternate_Cumulative_Distance":f"{alt_info['dist']:.1f}",
2106:             "Alternate_Leg_ETE":_pdf_mmss(alt_info['ete']),
2107:             "Alternate_Cumulative_ETE":_pdf_mmss(alt_info['ete']),
2108:             "Alternate_ETO":"",
2109:             "Alternate_Planned_Burnoff":f"{alt_info['burn']:.1f}",
2110:             "Alternate_Estimated_FOB":f"{rfuel05(legs[-1]['efob_end'] - alt_info['burn']):.1f}",
2111:         })
2112:     return d
2113: 
2114: def _build_payload_cont(all_legs, start_idx, *, alt_info=None, alt_choice=None):
2115:     legs_chunk = all_legs[start_idx:start_idx+11]
2116:     if not legs_chunk: return None
2117:     d = {"OBSERVATIONS":"SEVENAIR OPS: 131.675"}
2118: 
2119:     acc_d = 0.0
2120:     acc_t = 0
2121:     for offset, L in enumerate(legs_chunk, start=12):
2122:         acc_d = rdist05(acc_d + L["Dist"])
2123:         acc_t += L["time_sec"]
2124:         _fill_leg_line(d, offset, L, use_point="B", acc_d=acc_d, acc_t=acc_t)
2125: 
2126:     total_dist_all_nm   = rdist05(sum(L["Dist"] for L in all_legs))
2127:     total_time_all_sec  = sum(L["time_sec"] for L in all_legs)
2128:     total_burn_all_L    = rfuel05(sum(L["burn"] for L in all_legs))
2129:     final_efob_all_L    = all_legs[-1]["efob_end"]
2130: 
2131:     d["Leg23_Leg_Distance"] = f"{total_dist_all_nm:.1f}"
2132:     d["Leg23_Leg_ETE"]      = _pdf_mmss(total_time_all_sec)
2133:     d["Leg23_Planned_Burnoff"] = f"{total_burn_all_L:.1f}"
2134:     d["Leg23_Estimated_FOB"]   = f"{final_efob_all_L:.1f}"
2135: 
2136:     if alt_info and alt_choice:
2137:         d.update({
2138:             "Alternate_Airfield":alt_choice["name"],
2139:             "Alternate_Elevation":str(int(alt_choice["elev"])),
2140:             "Alternate_True_Course":f"{int(round(alt_info['tc'])):03d}",
2141:             "Alternate_True_Heading":f"{int(round(alt_info['th'])):03d}",
2142:             "Alternate_Magnetic_Heading":f"{int(round(alt_info['mh'])):03d}",
2143:             "Alternate_True_Airspeed":str(int(round(alt_info['tas']))),
2144:             "Alternate_Ground_Speed":str(int(round(alt_info['gs']))),
2145:             "Alternate_Leg_Distance":f"{alt_info['dist']:.1f}",
2146:             "Alternate_Cumulative_Distance":f"{alt_info['dist']:.1f}",
2147:             "Alternate_Leg_ETE":_pdf_mmss(alt_info['ete']),
2148:             "Alternate_Cumulative_ETE":_pdf_mmss(alt_info['ete']),
2149:             "Alternate_ETO":"",
2150:             "Alternate_Planned_Burnoff":f"{alt_info['burn']:.1f}",
2151:             "Alternate_Estimated_FOB":f"{rfuel05(all_legs[start_idx+len(legs_chunk)-1]['efob_end'] - alt_info['burn']):.1f}",
2152:         })
2153:     return d
2154: 
2155: # ========= LEGS BRIEFING =========
2156: def _leg_altitude_profile_str(A, B):
2157:     a1 = int(round(A["alt"]))
2158:     a2 = int(round(B["alt"]))
2159:     if a2 > a1:
2160:         trend = "SUBIDA"
2161:     elif a2 < a1:
2162:         trend = "DESCIDA"
2163:     else:
2164:         trend = "MANTER"
2165:     return f"{a1} -> {a2} ({trend})"
2166: 
2167: def build_leg_briefing_rows(legs):
2168:     rows = []
2169:     for idx, L in enumerate(legs, start=1):
2170:         A, B = L["A"], L["B"]
2171:         vor = None
2172:         radial_str = ""
2173:         vor_str = ""
2174:         try:
2175:             vor = _choose_vor_for_point(B)
2176:             if vor:
2177:                 vor_str = fmt_ident_with_freq(vor)
2178:                 radial_str = fmt_radial_distance_from(vor, B["lat"], B["lon"])
2179:         except Exception:
2180:             pass
2181: 
2182:         rows.append({
2183:             "Leg": idx,
2184:             "From": A["name"],
2185:             "To": B["name"],
2186:             "MH": f"{int(round(L['MH'])):03d}",
2187:             "TC": f"{int(round(L['TC'])):03d}",
2188:             "VOR": vor_str,
2189:             "Radial/Dist": radial_str,
2190:             "Tempo": _pdf_mmss(L["time_sec"]),
2191:             "Alt": _leg_altitude_profile_str(A, B),
2192:             "Profile": L["profile"],
2193:         })
2194:     return rows
2195: 
2196: def generate_legs_briefing_pdf(path: str, rows):
2197:     try:
2198:         from reportlab.lib.pagesizes import A4
2199:         from reportlab.pdfgen import canvas
2200:         from reportlab.lib.units import mm
2201:     except ImportError:
2202:         st.error("reportlab não está instalado. Instala 'reportlab' para gerar o briefing em PDF.")
2203:         return None
2204: 
2205:     c = canvas.Canvas(path, pagesize=A4)
2206:     width, height = A4
2207: 
2208:     x_margin = 15 * mm
2209:     y = height - 20 * mm
2210: 
2211:     title = f"Route briefing (legs) — {st.session_state.aircraft_type}"
2212:     c.setFont("Helvetica-Bold", 14)
2213:     c.drawString(x_margin, y, title)
2214:     y -= 10 * mm
2215: 
2216:     headers = ["Leg", "From", "To", "MH", "TC", "VOR", "Radial/Dist", "Tempo", "Alt", "Profile"]
2217:     col_widths = [12*mm, 28*mm, 28*mm, 12*mm, 12*mm, 28*mm, 28*mm, 18*mm, 30*mm, 20*mm]
2218: 
2219:     c.setFont("Helvetica-Bold", 8)
2220:     x = x_margin
2221:     for h, w in zip(headers, col_widths):
2222:         c.drawString(x, y, h)
2223:         x += w
2224:     y -= 6 * mm
2225:     c.line(x_margin, y+2*mm, x_margin + sum(col_widths), y+2*mm)
2226: 
2227:     c.setFont("Helvetica", 7)
2228:     for row in rows:
2229:         if y < 20 * mm:
2230:             c.showPage()
2231:             y = height - 20 * mm
2232:             c.setFont("Helvetica-Bold", 14)
2233:             c.drawString(x_margin, y, title + " (cont.)")
2234:             y -= 10 * mm
2235:             c.setFont("Helvetica-Bold", 8)
2236:             x = x_margin
2237:             for h, w in zip(headers, col_widths):
2238:                 c.drawString(x, y, h)
2239:                 x += w
2240:             y -= 6 * mm
2241:             c.line(x_margin, y+2*mm, x_margin + sum(col_widths), y+2*mm)
2242:             c.setFont("Helvetica", 7)
2243: 
2244:         x = x_margin
2245:         vals = [
2246:             row["Leg"],
2247:             row["From"],
2248:             row["To"],
2249:             row["MH"],
2250:             row["TC"],
2251:             row["VOR"],
2252:             row["Radial/Dist"],
2253:             row["Tempo"],
2254:             row["Alt"],
2255:             row["Profile"],
2256:         ]
2257:         for val, w in zip(vals, col_widths):
2258:             c.drawString(x, y, str(val))
2259:             x += w
2260:         y -= 5 * mm
2261: 
2262:     c.save()
2263:     return path
2264: 
2265: # ========= BOTÕES PDF =========
2266: cX, cY = st.columns([1,1])
2267: with cX:
2268:     make_pdfs = st.button("Gerar PDF(s) NAVLOG", type="primary", use_container_width=True)
2269: with cY:
2270:     st.caption("Principal até 22 legs; continuação se exceder + briefing por leg.")
2271: 
2272: if make_pdfs:
2273:     if not st.session_state.legs:
2274:         st.error("Gera primeiro a rota.")
2275:     else:
2276:         d_main = _build_payloads_main(
2277:             st.session_state.legs,
2278:             callsign=callsign,
2279:             registration=registration,
2280:             student=student,
2281:             lesson=lesson,
2282:             instructor=instructor,
2283:             dept=dept_freq,
2284:             enroute=enroute_freq,
2285:             arrival=arrival_freq,
2286:             etd=etd,
2287:             eta=eta,
2288:             alt_info=alt_leg_info if (use_alt and alt_choice) else None,
2289:             alt_choice=alt_choice if (use_alt and alt_choice) else None
2290:         )
2291:         out_main = _fill_pdf(TEMPLATE_MAIN, "NAVLOG_FILLED.pdf", d_main)
2292:         with open(out_main, "rb") as f:
2293:             st.download_button(
2294:                 "⬇️ NAVLOG (principal)",
2295:                 f.read(),
2296:                 file_name="NAVLOG_FILLED.pdf",
2297:                 use_container_width=True
2298:             )
2299: 
2300:         if len(st.session_state.legs) > 22:
2301:             d_cont = _build_payload_cont(
2302:                 st.session_state.legs,
2303:                 start_idx=22,
2304:                 alt_info=alt_leg_info if (use_alt and alt_choice) else None,
2305:                 alt_choice=alt_choice if (use_alt and alt_choice) else None
2306:             )
2307:             out_cont = _fill_pdf(TEMPLATE_CONT, "NAVLOG_FILLED_1.pdf", d_cont)
2308:             with open(out_cont, "rb") as f:
2309:                 st.download_button(
2310:                     "⬇️ NAVLOG (continuação)",
2311:                     f.read(),
2312:                     file_name="NAVLOG_FILLED_1.pdf",
2313:                     use_container_width=True
2314:                 )
2315: 
2316:         rows = build_leg_briefing_rows(st.session_state.legs)
2317:         st.markdown("### 📋 Leg briefing")
2318:         st.dataframe(pd.DataFrame(rows))
2319: 
2320:         briefing_pdf_path = generate_legs_briefing_pdf("NAVLOG_LEGS_BRIEFING.pdf", rows)