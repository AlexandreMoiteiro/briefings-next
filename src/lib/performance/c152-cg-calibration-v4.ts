export type C152NormalizedPoint = { x: number; y: number };

export const C152_CG_CALIBRATION_V4 = {
  xTicks: {
    45: { x: 0.4553805774278215, y: 0.9048067723984432 },
    50: { x: 0.5485564304461942, y: 0.9038797162791824 },
  },
  yTicks: {
    1300: { x: 0.17716535433070865, y: 0.7833624207752914 },
    1400: { x: 0.17716535433070865, y: 0.7434990076470813 },
  },
  envelope: {
    forward: [
      { x: 0.1942257217847769, y: 0.9057338285177038 },
      { x: 0.2664041994750656, y: 0.8547457419583653 },
      { x: 0.3359580052493438, y: 0.806538823756809 },
      { x: 0.4146981627296588, y: 0.7536966249589491 },
      { x: 0.47506561679790027, y: 0.7193955485463032 },
      { x: 0.5354330708661418, y: 0.6869485843721786 },
      { x: 0.589238845144357, y: 0.660991013032879 },
      { x: 0.6351706036745407, y: 0.6350334416935794 },
    ],
    upper: [
      { x: 0.631233595800525, y: 0.6341063855743188 },
      { x: 0.7572178477690289, y: 0.6350334416935794 },
    ],
    aft: [
      { x: 0.7519685039370079, y: 0.6331793294550581 },
      { x: 0.29396325459317585, y: 0.9075879407562252 },
    ],
  },
} as const;

export function c152MomentToNormalizedX(momentThousandsLbIn: number) {
  const a = C152_CG_CALIBRATION_V4.xTicks[45];
  const b = C152_CG_CALIBRATION_V4.xTicks[50];
  return a.x + ((momentThousandsLbIn - 45) / 5) * (b.x - a.x);
}

export function c152WeightToNormalizedY(weightLb: number) {
  const a = C152_CG_CALIBRATION_V4.yTicks[1300];
  const b = C152_CG_CALIBRATION_V4.yTicks[1400];
  return a.y + ((weightLb - 1300) / 100) * (b.y - a.y);
}
