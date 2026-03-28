import { type WeightRecord } from './healthApi';

// 부위별 분포 비율 (Mi 앱 실측 2회 평균 기반)
const SF = { arm: 0.067, trunk: 0.504, leg: 0.135 };  // 체지방 비율
const SM = { arm: 0.058, trunk: 0.484, leg: 0.164 };  // 근육 비율

const f1 = (v: number) => v.toFixed(1);

interface Item { label: string; kg: number; pct: number; color: string }

interface SegPart {
  label: string;
  fatKg: number;
  muscleKg: number;
}

const SegTable = ({ parts }: { parts: SegPart[] }) => (
  <div>
    <div className="mb-1.5 flex text-[10px] text-app-muted">
      <span className="w-14" />
      <span className="flex-1 text-center" style={{ color: '#f87171' }}>체지방</span>
      <span className="flex-1 text-center" style={{ color: '#34d399' }}>근육량</span>
    </div>
    <div className="space-y-1">
      {parts.map((p) => (
        <div key={p.label} className="flex items-center gap-1">
          <span className="w-14 text-[11px] text-app-muted">{p.label}</span>
          <span className="flex-1 rounded-md px-2 py-0.5 text-center text-[11px] font-medium"
            style={{ background: '#f8717122', color: '#f87171' }}>
            {f1(p.fatKg)}kg
          </span>
          <span className="flex-1 rounded-md px-2 py-0.5 text-center text-[11px] font-medium"
            style={{ background: '#34d39922', color: '#34d399' }}>
            {f1(p.muscleKg)}kg
          </span>
        </div>
      ))}
    </div>
  </div>
);

const CompBar = ({ items, total }: { items: Item[]; total: number }) => (
  <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full">
    {items.map((it) => (
      <div
        key={it.label}
        style={{ width: `${(it.kg / total) * 100}%`, background: it.color }}
        title={`${it.label} ${f1(it.kg)}kg`}
      />
    ))}
  </div>
);

const CompLegend = ({ items }: { items: Item[] }) => (
  <div className="space-y-1">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-2">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: it.color }} />
        <span className="w-12 text-[11px] text-app-muted">{it.label}</span>
        <span className="flex-1 text-right text-xs font-semibold" style={{ color: it.color }}>{f1(it.kg)}kg</span>
        <span className="w-10 text-right text-[11px] text-app-muted">{f1(it.pct)}%</span>
      </div>
    ))}
  </div>
);


interface Props { r: WeightRecord }

export const WeightCompositionSection = ({ r }: Props): JSX.Element | null => {
  if (!r.body_fat_pct || !r.muscle_kg || !r.bone_kg || !r.water_pct) return null;

  const fatKg   = r.weight_kg * r.body_fat_pct / 100;
  const lbm     = r.weight_kg - fatKg;
  const waterKg = r.weight_kg * r.water_pct / 100;
  const protKg  = Math.max(0, lbm - waterKg - r.bone_kg);

  const items: Item[] = [
    { label: '체지방', kg: fatKg,      pct: r.body_fat_pct,                color: '#f87171' },
    { label: '수분',   kg: waterKg,    pct: r.water_pct,                   color: '#38bdf8' },
    { label: '근육',   kg: r.muscle_kg, pct: (r.muscle_kg / r.weight_kg) * 100, color: '#34d399' },
    { label: '단백질', kg: protKg,     pct: (protKg / r.weight_kg) * 100,  color: '#a78bfa' },
    { label: '뼈',    kg: r.bone_kg,   pct: (r.bone_kg / r.weight_kg) * 100, color: '#fbbf24' },
  ];

  const segParts: SegPart[] = [
    { label: '좌팔',  fatKg: fatKg * SF.arm,        muscleKg: r.muscle_kg * SM.arm },
    { label: '우팔',  fatKg: fatKg * SF.arm,        muscleKg: r.muscle_kg * SM.arm },
    { label: '몸통',  fatKg: fatKg * SF.trunk,      muscleKg: r.muscle_kg * SM.trunk },
    { label: '좌다리', fatKg: fatKg * SF.leg,       muscleKg: r.muscle_kg * SM.leg },
    { label: '우다리', fatKg: fatKg * SF.leg,       muscleKg: r.muscle_kg * SM.leg },
  ];

  return (
    <div className="space-y-3">
      {/* Composition breakdown */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-3 text-xs font-medium text-app-muted">체성분 구성</p>
        <CompBar items={items} total={r.weight_kg} />
        <CompLegend items={items} />
      </div>

      {/* Segmental analysis */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-3 text-xs font-medium">
          부위별 분석{' '}
          <span className="text-[10px] font-normal text-app-muted">(추정)</span>
        </p>
        <SegTable parts={segParts} />
      </div>
    </div>
  );
};
