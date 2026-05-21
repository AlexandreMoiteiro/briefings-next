2480:         with c0:
2481:             callsign = st.text_input("Callsign", "RVP")
2482:         with c1:
2483:             registration = st.selectbox("Registration", reg_options)
2484:         with c2:
2485:             student = st.text_input("Student", "")
2486:         with c3:
2487:             lesson = st.text_input("Lesson", "")
2488:         with c4:
2489:             instructor = st.text_input("Instructor", "")
2490:         c5, c6, c7, c8, c9 = st.columns(5)
2491:         with c5:
2492:             etd = st.text_input("ETD", "")
2493:         with c6:
2494:             eta = st.text_input("ETA", "")
2495:         with c7:
2496:             dept_freq = st.text_input("FREQ DEPT", "119.805")
2497:         with c8:
2498:             enroute_freq = st.text_input("FREQ ENROUTE", "123.755")
2499:         with c9:
2500:             arrival_freq = st.text_input("FREQ ARRIVAL", "131.675")
2501:         c10, c11 = st.columns(2)
2502:         with c10:
2503:             fl_alt = st.text_input("FLIGHT LEVEL / ALTITUDE", "")
2504:         with c11:
2505:             temp_isa = st.text_input("TEMP / ISA DEV", "")
2506:         header = {
2507:             "callsign": callsign,
2508:             "registration": registration,
2509:             "student": student,
2510:             "lesson": lesson,
2511:             "instructor": instructor,
2512:             "etd": etd,
2513:             "eta": eta,
2514:             "dept_freq": dept_freq,
2515:             "enroute_freq": enroute_freq,
2516:             "arrival_freq": arrival_freq,
2517:             "fl_alt": fl_alt,
2518:             "temp_isa": temp_isa,
2519:         }
2520:         if st.button("Gerar PDF NAVLOG", type="primary", use_container_width=True):
2521:             if not TEMPLATE_MAIN.exists():
2522:                 st.error("NAVLOG_FORM.pdf não encontrado.")
2523:             elif PdfReader is None:
2524:                 st.error("pdfrw não está instalado. Instala com: pip install pdfrw")
2525:             else:
2526:                 try:
2527:                     single_page = len(st.session_state.legs) <= PDF_SINGLE_PAGE_LEG_ROWS
2528:                     payload = build_pdf_payload(
2529:                         st.session_state.legs,
2530:                         header,
2531:                         0,
2532:                         PDF_SINGLE_PAGE_LEG_ROWS if single_page else PDF_FULL_TEMPLATE_LEG_ROWS,
2533:                         total_on_next_row=single_page,
2534:                         fill_continuation_total=not single_page,
2535:                     )
2536:                     out = fill_pdf(TEMPLATE_MAIN, OUTPUT_MAIN, payload, pages_to_keep=1 if single_page else None)
2537:                     with open(out, "rb") as file:
2538:                         st.download_button("⬇️ NAVLOG principal", file.read(), file_name="NAVLOG_FILLED.pdf", mime="application/pdf", use_container_width=True)
2539:                     if len(st.session_state.legs) > PDF_FULL_TEMPLATE_LEG_ROWS and TEMPLATE_CONT.exists():
2540:                         payload2 = build_pdf_payload(st.session_state.legs, header, PDF_FULL_TEMPLATE_LEG_ROWS, 11)
2541:                         out2 = fill_pdf(TEMPLATE_CONT, OUTPUT_CONT, payload2)
2542:                         with open(out2, "rb") as file:
2543:                             st.download_button("⬇️ NAVLOG continuação", file.read(), file_name="NAVLOG_FILLED_1.pdf", mime="application/pdf", use_container_width=True)
2544:                 except Exception as exc:
2545:                     st.error(f"Erro ao gerar PDF: {exc}")
2546: 
2547: st.markdown("<hr><div class='small-muted'>Ferramenta de planeamento. SIDs/STARs only. Aproximações, cartas, NOTAM, AIP/AIRAC, meteorologia, mínimos, autorizações ATC e performance real têm de ser confirmados externamente.</div>", unsafe_allow_html=True)