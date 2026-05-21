
# ===== 04__Briefings-main__pages__NavLog.py :: render_map 1607-1814 =====
1607: def render_map(nodes, legs, base_choice):
1608:     if not nodes or not legs:
1609:         st.info("Adiciona pelo menos 2 WPs e carrega em **Gerar/Atualizar rota**.")
1610:         return
1611: 
1612:     m = folium.Map(
1613:         location=list(st.session_state.map_center),
1614:         zoom_start=st.session_state.map_zoom,
1615:         tiles=None,
1616:         control_scale=True,
1617:         prefer_canvas=True
1618:     )
1619: 
1620:     if base_choice == "OpenTopoMap (VFR-ish)":
1621:         folium.TileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr="© OpenTopoMap").add_to(m)
1622:     elif base_choice == "OSM Standard":
1623:         folium.TileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr="© OpenStreetMap").add_to(m)
1624:     elif base_choice == "Terrain Hillshade":
1625:         folium.TileLayer(
1626:             "https://services.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
1627:             attr="© Esri"
1628:         ).add_to(m)
1629:     else:
1630:         folium.TileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr="© OpenTopoMap").add_to(m)
1631: 
1632:     token = st.session_state.openaip_token.strip()
1633:     if st.session_state.show_openaip and token:
1634:         folium.TileLayer(
1635:             tiles=(
1636:                 "https://{s}.api.tiles.openaip.net/api/data/openaip/"
1637:                 "{z}/{x}/{y}.png?apiKey=" + token
1638:             ),
1639:             attr="© openAIP",
1640:             name="openAIP (VFR data)",
1641:             overlay=True,
1642:             control=True,
1643:             subdomains="abc",
1644:             opacity=float(st.session_state.openaip_alpha),
1645:             max_zoom=20,
1646:         ).add_to(m)
1647: 
1648:     Fullscreen(position='topleft', title='Fullscreen', force_separate_button=True).add_to(m)
1649: 
1650:     for L in legs:
1651:         if L["profile"] == "STOP":
1652:             continue
1653:         latlngs = [(L["A"]["lat"],L["A"]["lon"]), (L["B"]["lat"],L["B"]["lon"])]
1654:         color = PROFILE_COLORS.get(L["profile"], "#C000FF")
1655:         folium.PolyLine(latlngs, color="#ffffff", weight=10, opacity=1.0).add_to(m)
1656:         folium.PolyLine(latlngs, color=color, weight=4, opacity=1.0).add_to(m)
1657: 
1658:     if st.session_state.show_ticks:
1659:         for L in legs:
1660:             if L["profile"] == "STOP":
1661:                 continue
1662:             if L["GS"]<=0 or not L["cps"]:
1663:                 continue
1664:             for cp in L["cps"]:
1665:                 d = min(L["Dist"], L["GS"]*(cp["t"]/3600.0))
1666:                 latm, lonm = point_along_gc(L["A"]["lat"],L["A"]["lon"], L["B"]["lat"],L["B"]["lon"], d)
1667:                 llat, llon = dest_point(latm, lonm, L["TC"]-90, CP_TICK_HALF)
1668:                 rlat, rlon = dest_point(latm, lonm, L["TC"]+90, CP_TICK_HALF)
1669:                 folium.PolyLine([(llat,llon),(rlat,rlon)], color="#111111", weight=3, opacity=1).add_to(m)
1670: 
1671:     if st.session_state.show_doghouses:
1672:         def z_clear(lat, lon, zs):
1673:             if not zs: return 9e9
1674:             return min(gc_dist_nm(lat, lon, a, b) - r for a, b, r in zs)
1675:         zones = []
1676:         for L in legs:
1677:             if L["profile"] == "STOP":
1678:                 continue
1679:             dist_leg = gc_dist_nm(L["A"]["lat"], L["A"]["lon"], L["B"]["lat"], L["B"]["lon"])
1680:             steps = max(2, int(dist_leg / 0.9))
1681:             for k in range(1, steps):
1682:                 p = point_along_gc(L["A"]["lat"], L["A"]["lon"], L["B"]["lat"], L["B"]["lon"], dist_leg * k / steps)
1683:                 zones.append((p[0], p[1], 0.38))
1684: 
1685:         prev_side = None
1686:         for idx, L in enumerate(legs):
1687:             if L["profile"] == "STOP":
1688:                 continue
1689:             if L["Dist"] < 0.2:
1690:                 continue
1691:             base = min(1.25, max(0.9, L["Dist"]/7.0))
1692:             s = base * float(st.session_state.text_scale)
1693:             cur_tc = L["TC"]
1694:             nxt_tc = legs[idx+1]["TC"] if idx < len(legs)-1 else L["TC"]
1695:             turn = angdiff(nxt_tc, cur_tc)
1696:             prefer = +1 if turn > 12 else (-1 if turn < -12 else (prev_side or +1))
1697:             mid_lat, mid_lon = point_along_gc(L["A"]["lat"], L["A"]["lon"], L["B"]["lat"], L["B"]["lon"], 0.50 * L["Dist"])
1698:             side_off_nm = 1.2
1699:             anchor_lat, anchor_lon = dest_point(mid_lat, mid_lon, L["TC"] + 90 * prefer, side_off_nm)
1700:             if z_clear(anchor_lat, anchor_lon, zones) < LABEL_MIN_CLEAR:
1701:                 for extra in (0.6, 1.0, 1.6, 2.2):
1702:                     cand_lat, cand_lon = dest_point(anchor_lat, anchor_lon, L["TC"] + 90 * prefer, extra)
1703:                     if z_clear(cand_lat, cand_lon, zones) >= LABEL_MIN_CLEAR:
1704:                         anchor_lat, anchor_lon = cand_lat, cand_lon
1705:                         break
1706:             zones.append((anchor_lat, anchor_lon, 1.0))
1707:             prev_side = prefer
1708: 
1709:             info = {
1710:                 "mh_tc": f"{deg3(L['MH'])}|{deg3(L['TC'])}",
1711:                 "alt":   f"{int(round(L['A']['alt']))}{NBSP_THIN}ft",
1712:                 "ete":   mmss(L['time_sec']),
1713:             }
1714: 
1715:             folium.PolyLine([(mid_lat, mid_lon), (anchor_lat, anchor_lon)], color="#000000", weight=2, opacity=1.0).add_to(m)
1716:             html_marker(m, anchor_lat, anchor_lon, doghouse_html_capsule(info, L["profile"], L["TC"], scale=s))
1717: 
1718:     for N in nodes:
1719:         html_marker(
1720:             m, N["lat"], N["lon"],
1721:             "<div style='transform:translate(-50%,-50%);width:18px;height:18px;"
1722:             "border:2px solid #000;border-radius:50%;background:#fff;"
1723:             "box-shadow:0 2px 4px rgba(0,0,0,.3)'></div>"
1724:         )
1725: 
1726:     info_nodes = [{"eto": None, "efob": None} for _ in nodes]
1727:     if legs:
1728:         info_nodes[0]["eto"]  = legs[0]["clock_start"]
1729:         info_nodes[0]["efob"] = legs[0]["efob_start"]
1730:         for i in range(1, len(nodes)):
1731:             eta = None
1732:             efob = None
1733:             for L in legs:
1734:                 if abs(L["B"]["lat"] - nodes[i]["lat"])<1e-6 and abs(L["B"]["lon"] - nodes[i]["lon"])<1e-6:
1735:                     eta = L["clock_end"]
1736:                     efob = L["efob_end"]
1737:             info_nodes[i]["eto"]  = eta
1738:             info_nodes[i]["efob"] = efob
1739: 
1740:     node_tc = []
1741:     if legs:
1742:         for i in range(len(nodes)):
1743:             found = None
1744:             for L in legs:
1745:                 if abs(L["A"]["lat"] - nodes[i]["lat"])<1e-6 and abs(L["A"]["lon"] - nodes[i]["lon"])<1e-6 and L["profile"]!="STOP":
1746:                     found = L["TC"]
1747:                     break
1748:             if found is None:
1749:                 found = legs[-1]["TC"]
1750:             node_tc.append(found)
1751:     else:
1752:         node_tc = [0.0]*len(nodes)
1753: 
1754:     grouped=[]
1755:     seen=set()
1756:     for idx,N in enumerate(nodes):
1757:         base_name = re.sub(r"\s+#\d+$","",str(N["name"]))
1758:         key=(round(N["lat"],6),round(N["lon"],6),base_name)
1759:         if key not in seen:
1760:             seen.add(key)
1761:             grouped.append({
1762:                 "name": base_name,
1763:                 "lat": N["lat"],
1764:                 "lon": N["lon"],
1765:                 "pairs":[(info_nodes[idx]["efob"], info_nodes[idx]["eto"])],
1766:                 "angle": node_tc[idx],
1767:             })
1768:         else:
1769:             for g in grouped:
1770:                 if g["name"]==base_name and abs(g["lat"]-N["lat"])<1e-6 and abs(g["lon"]-N["lon"])<1e-6:
1771:                     g["pairs"].append((info_nodes[idx]["efob"], info_nodes[idx]["eto"]))
1772:                     break
1773: 
1774:     for g in grouped:
1775:         s = float(st.session_state.text_scale)
1776:         html_marker(m, g["lat"], g["lon"], wp_label_html_rot(g, s, g["angle"]))
1777: 
1778:     if st.session_state.show_airspaces:
1779:         combined_asp = []
1780:         for nm in st.session_state.preset_selected:
1781:             A = PRESET_AIRSPACES.get(nm)
1782:             if A:
1783:                 tmp = dict(A)
1784:                 tmp["name"] = nm
1785:                 combined_asp.append(tmp)
1786:         combined_asp += st.session_state.airspaces
1787:         for asp in combined_asp:
1788:             if asp.get("width_nm"):
1789:                 coords = asp.get("coords", [])
1790:                 if len(coords) >= 2:
1791:                     polycoords = corridor_polygon(coords[0], coords[1], asp["width_nm"])
1792:                 else:
1793:                     polycoords = []
1794:             else:
1795:                 polycoords = asp.get("coords", [])
1796:             if not polycoords:
1797:                 continue
1798:             edge_color = CORRIDOR_COLOR if asp.get("width_nm") else ASPACE_COLOR
1799:             folium.Polygon(
1800:                 locations=[(lat,lon) for (lat,lon) in polycoords],
1801:                 color=edge_color,
1802:                 weight=2,
1803:                 opacity=EDGE_OPACITY,
1804:                 fill=True,
1805:                 fill_color=edge_color,
1806:                 fill_opacity=FILL_OPACITY,
1807:                 tooltip=f"{asp['name']} {asp.get('floor','')}→{asp.get('ceiling','')} {asp.get('notes','')}"
1808:             ).add_to(m)
1809:             clat, clon = polygon_centroid(polycoords)
1810:             s_label = float(st.session_state.text_scale)
1811:             html_marker(m, clat, clon, airspace_label_html(asp, s_label))
1812: 
1813:     folium.LayerControl(collapsed=False).add_to(m)
1814:     st_folium(m, width=None, height=760, key="mainmap", returned_objects=[])

# ===== 04__Briefings-main__pages__NavLog.py :: _pdf_mmss 1952-1957 =====
1952: def _pdf_mmss(sec:int):
1953:     total_minutes = int(round(float(sec) / 60.0))
1954:     if total_minutes >= 60:
1955:         hours, mins = divmod(total_minutes, 60)
1956:         return f"{hours:02d}h{mins:02d}"
1957:     return f"{total_minutes:02d}:00"

# ===== 04__Briefings-main__pages__NavLog.py :: _fill_pdf 1959-1984 =====
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

# ===== 04__Briefings-main__pages__NavLog.py :: _fill_leg_line 2003-2038 =====
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

# ===== 04__Briefings-main__pages__NavLog.py :: _build_payloads_main 2040-2112 =====
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

# ===== 04__Briefings-main__pages__NavLog.py :: _build_payload_cont 2114-2153 =====
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

# ===== 04__Briefings-main__pages__NavLog.py :: build_leg_briefing_rows 2167-2194 =====
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

# ===== 04__Briefings-main__pages__NavLog.py :: generate_legs_briefing_pdf 2196-2263 =====
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
