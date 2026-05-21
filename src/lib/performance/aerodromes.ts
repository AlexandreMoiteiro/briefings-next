export type PerformanceRunway = {
  id: string;
  qfu: number;
  toda: number;
  lda: number;
  slope_pc?: number;
  paved?: boolean;
};

export type PerformanceAerodrome = {
  name: string;
  lat: number;
  lon: number;
  elev_ft: number;
  runways: PerformanceRunway[];
};

export const PERFORMANCE_AERODROMES = {
  "LEBZ": {
    "name": "Badajoz",
    "lat": 38.8913,
    "lon": -6.8214,
    "elev_ft": 608.0,
    "runways": [
      {
        "id": "13",
        "qfu": 130.0,
        "toda": 2852.0,
        "lda": 2852.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "31",
        "qfu": 310.0,
        "toda": 2852.0,
        "lda": 2852.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPBR": {
    "name": "Braga",
    "lat": 41.5872,
    "lon": -8.4451,
    "elev_ft": 243.0,
    "runways": [
      {
        "id": "18",
        "qfu": 180.0,
        "toda": 939.0,
        "lda": 939.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "36",
        "qfu": 360.0,
        "toda": 939.0,
        "lda": 939.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPBG": {
    "name": "Bragança",
    "lat": 41.8578,
    "lon": -6.7074,
    "elev_ft": 2278.0,
    "runways": [
      {
        "id": "02",
        "qfu": 20.0,
        "toda": 1700.0,
        "lda": 1700.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "20",
        "qfu": 200.0,
        "toda": 1700.0,
        "lda": 1700.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPCB": {
    "name": "Castelo Branco",
    "lat": 39.8483,
    "lon": -7.4417,
    "elev_ft": 1251.0,
    "runways": [
      {
        "id": "16",
        "qfu": 160.0,
        "toda": 1460.0,
        "lda": 1460.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "34",
        "qfu": 340.0,
        "toda": 1460.0,
        "lda": 1460.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPCO": {
    "name": "Coimbra",
    "lat": 40.1582,
    "lon": -8.4705,
    "elev_ft": 570.0,
    "runways": [
      {
        "id": "16",
        "qfu": 160.0,
        "toda": 923.0,
        "lda": 923.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "34",
        "qfu": 340.0,
        "toda": 923.0,
        "lda": 923.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPEV": {
    "name": "Évora",
    "lat": 38.5297,
    "lon": -7.8919,
    "elev_ft": 807.0,
    "runways": [
      {
        "id": "01",
        "qfu": 10.0,
        "toda": 1300.0,
        "lda": 1300.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "19",
        "qfu": 190.0,
        "toda": 1300.0,
        "lda": 1300.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "07",
        "qfu": 70.0,
        "toda": 1300.0,
        "lda": 1300.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "25",
        "qfu": 250.0,
        "toda": 1300.0,
        "lda": 1300.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LEMG": {
    "name": "Málaga",
    "lat": 36.6749,
    "lon": -4.4991,
    "elev_ft": 52.0,
    "runways": [
      {
        "id": "12",
        "qfu": 120.0,
        "toda": 2750.0,
        "lda": 2750.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "30",
        "qfu": 300.0,
        "toda": 2750.0,
        "lda": 2750.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "13",
        "qfu": 130.0,
        "toda": 3200.0,
        "lda": 3200.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "31",
        "qfu": 310.0,
        "toda": 3200.0,
        "lda": 3200.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPSO": {
    "name": "Ponte de Sôr",
    "lat": 39.2117,
    "lon": -8.0578,
    "elev_ft": 390.0,
    "runways": [
      {
        "id": "03",
        "qfu": 30.0,
        "toda": 1800.0,
        "lda": 1800.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "21",
        "qfu": 210.0,
        "toda": 1800.0,
        "lda": 1800.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LEZL": {
    "name": "Sevilha",
    "lat": 37.418,
    "lon": -5.8931,
    "elev_ft": 111.0,
    "runways": [
      {
        "id": "09",
        "qfu": 90.0,
        "toda": 3364.0,
        "lda": 3364.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "27",
        "qfu": 270.0,
        "toda": 3364.0,
        "lda": 3364.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LEVX": {
    "name": "Vigo",
    "lat": 42.2318,
    "lon": -8.6268,
    "elev_ft": 856.0,
    "runways": [
      {
        "id": "01",
        "qfu": 10.0,
        "toda": 2385.0,
        "lda": 2385.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "19",
        "qfu": 190.0,
        "toda": 2385.0,
        "lda": 2385.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPVR": {
    "name": "Vila Real",
    "lat": 41.2743,
    "lon": -7.7205,
    "elev_ft": 1832.0,
    "runways": [
      {
        "id": "02",
        "qfu": 20.0,
        "toda": 946.0,
        "lda": 946.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "20",
        "qfu": 200.0,
        "toda": 946.0,
        "lda": 946.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPVZ": {
    "name": "Viseu",
    "lat": 40.7255,
    "lon": -7.889,
    "elev_ft": 2060.0,
    "runways": [
      {
        "id": "18",
        "qfu": 180.0,
        "toda": 1000.0,
        "lda": 1000.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "36",
        "qfu": 360.0,
        "toda": 1000.0,
        "lda": 1000.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPCS": {
    "name": "Cascais",
    "lat": 38.7256,
    "lon": -9.3553,
    "elev_ft": 326.0,
    "runways": [
      {
        "id": "17",
        "qfu": 170.0,
        "toda": 1400.0,
        "lda": 1400.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "35",
        "qfu": 350.0,
        "toda": 1400.0,
        "lda": 1400.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPMT": {
    "name": "Montijo",
    "lat": 38.7039,
    "lon": -9.035,
    "elev_ft": 46.0,
    "runways": [
      {
        "id": "07",
        "qfu": 70.0,
        "toda": 2448.0,
        "lda": 2448.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "25",
        "qfu": 250.0,
        "toda": 2448.0,
        "lda": 2448.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "01",
        "qfu": 10.0,
        "toda": 2187.0,
        "lda": 2187.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "19",
        "qfu": 190.0,
        "toda": 2187.0,
        "lda": 2187.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPST": {
    "name": "Sintra",
    "lat": 38.8311,
    "lon": -9.3397,
    "elev_ft": 441.0,
    "runways": [
      {
        "id": "17",
        "qfu": 170.0,
        "toda": 1800.0,
        "lda": 1800.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "35",
        "qfu": 350.0,
        "toda": 1800.0,
        "lda": 1800.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPBJ": {
    "name": "Beja",
    "lat": 38.0789,
    "lon": -7.9322,
    "elev_ft": 636.0,
    "runways": [
      {
        "id": "01L",
        "qfu": 10.0,
        "toda": 2448.0,
        "lda": 2448.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "19R",
        "qfu": 190.0,
        "toda": 2448.0,
        "lda": 2448.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "01R",
        "qfu": 10.0,
        "toda": 3449.0,
        "lda": 3449.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "19L",
        "qfu": 190.0,
        "toda": 3449.0,
        "lda": 3449.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPFR": {
    "name": "Faro",
    "lat": 37.0144,
    "lon": -7.9658,
    "elev_ft": 24.0,
    "runways": [
      {
        "id": "10",
        "qfu": 100.0,
        "toda": 2490.0,
        "lda": 2490.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "28",
        "qfu": 280.0,
        "toda": 2490.0,
        "lda": 2490.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPPM": {
    "name": "Portimão",
    "lat": 37.1493,
    "lon": -8.58397,
    "elev_ft": 5.0,
    "runways": [
      {
        "id": "11",
        "qfu": 110.0,
        "toda": 860.0,
        "lda": 860.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "29",
        "qfu": 290.0,
        "toda": 860.0,
        "lda": 860.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPPR": {
    "name": "Porto",
    "lat": 41.2481,
    "lon": -8.6811,
    "elev_ft": 227.0,
    "runways": [
      {
        "id": "17",
        "qfu": 170.0,
        "toda": 3480.0,
        "lda": 3480.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "35",
        "qfu": 350.0,
        "toda": 3480.0,
        "lda": 3480.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  },
  "LPPT": {
    "name": "Lisboa / Humberto Delgado",
    "lat": 38.7813,
    "lon": -9.1359,
    "elev_ft": 374.0,
    "runways": [
      {
        "id": "03",
        "qfu": 26.0,
        "toda": 3705.0,
        "lda": 3705.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "21",
        "qfu": 206.0,
        "toda": 3705.0,
        "lda": 3705.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "17",
        "qfu": 170.0,
        "toda": 2400.0,
        "lda": 2400.0,
        "slope_pc": 0.0,
        "paved": true
      },
      {
        "id": "35",
        "qfu": 350.0,
        "toda": 2400.0,
        "lda": 2400.0,
        "slope_pc": 0.0,
        "paved": true
      }
    ]
  }
} satisfies Record<string, PerformanceAerodrome>;


// Operational override: LPEV RWY 07/25 closed by AIP SUP; use 01/19 only.
if (PERFORMANCE_AERODROMES.LPEV) {
  PERFORMANCE_AERODROMES.LPEV.runways = [
    { id: "01", qfu: 6.0, toda: 1300.0, lda: 1300.0, slope_pc: 0.0, paved: true },
    { id: "19", qfu: 186.0, toda: 1300.0, lda: 1300.0, slope_pc: 0.0, paved: true },
  ];
}


function qfuFromRunwayId(id: string) {
  const match = String(id).trim().match(/^(\d{2})/);
  if (!match) return 0;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const qfu = (value * 10) % 360;
  return qfu === 0 ? 360 : qfu;
}

// QFU display follows runway designator × 10, matching the legacy PA-28 logic.
// True bearing remains an AIP reference, but the template field is RWY/QFU.
for (const aerodrome of Object.values(PERFORMANCE_AERODROMES)) {
  aerodrome.runways = aerodrome.runways.map((runway) => ({
    ...runway,
    qfu: qfuFromRunwayId(runway.id) || runway.qfu,
  }));
}

// Audited NAV Portugal eAIP overrides.
if (PERFORMANCE_AERODROMES.LPSO) {
  PERFORMANCE_AERODROMES.LPSO.runways = [
    { id: "03", qfu: 30, toda: 1800, lda: 1800, slope_pc: 0, paved: true },
    { id: "21", qfu: 210, toda: 1800, lda: 1800, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPEV) {
  PERFORMANCE_AERODROMES.LPEV.runways = [
    { id: "01", qfu: 10, toda: 1300, lda: 1245, slope_pc: 0, paved: true },
    { id: "19", qfu: 190, toda: 1300, lda: 1260, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPCB) {
  PERFORMANCE_AERODROMES.LPCB.runways = [
    { id: "16", qfu: 160, toda: 1520, lda: 1460, slope_pc: 0, paved: true },
    { id: "34", qfu: 340, toda: 1520, lda: 1460, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPPT) {
  PERFORMANCE_AERODROMES.LPPT.runways = [
    { id: "02", qfu: 20, toda: 3707, lda: 3707, slope_pc: 1, paved: true },
    { id: "20", qfu: 200, toda: 3707, lda: 3707, slope_pc: -1, paved: true },
  ];
}



// Final audited/legacy QFU values for performance PDF.
// qfu is the value printed in the official sheet RWY QFU field.
if (PERFORMANCE_AERODROMES.LPSO) {
  PERFORMANCE_AERODROMES.LPSO.runways = [
    { id: "03", qfu: 26, toda: 1800, lda: 1800, slope_pc: 0, paved: true },
    { id: "21", qfu: 206, toda: 1800, lda: 1800, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPEV) {
  PERFORMANCE_AERODROMES.LPEV.runways = [
    { id: "01", qfu: 4, toda: 1300, lda: 1245, slope_pc: 0, paved: true },
    { id: "19", qfu: 186, toda: 1300, lda: 1260, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPCB) {
  PERFORMANCE_AERODROMES.LPCB.runways = [
    { id: "16", qfu: 157, toda: 1520, lda: 1460, slope_pc: 0, paved: true },
    { id: "34", qfu: 337, toda: 1520, lda: 1460, slope_pc: 0, paved: true },
  ];
}

if (PERFORMANCE_AERODROMES.LPPT) {
  PERFORMANCE_AERODROMES.LPPT.runways = [
    { id: "02", qfu: 23, toda: 3707, lda: 3707, slope_pc: 1, paved: true },
    { id: "20", qfu: 203, toda: 3707, lda: 3707, slope_pc: -1, paved: true },
  ];
}

export const PERFORMANCE_ICAOS = Object.keys(PERFORMANCE_AERODROMES).sort();
