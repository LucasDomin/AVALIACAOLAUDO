import { useEffect, useMemo, useState } from "react";

type Comparable = {
  description: string;
  area: string;
  value: string;
  factors: string[];
};

type Sample = {
  index: number;
  description: string;
  area: number;
  value: number;
  unitValue: number;
  factorProduct: number;
  adjustedUnitValue: number;
  accepted: boolean;
  expectedOccurrences: number;
  zScore: number;
  reason?: string;
};

type SavedState = {
  activeStep: number;
  comparableCount: number;
  factorCount: number;
  targetDescription: string;
  targetArea: string;
  comparables: Comparable[];
};

const STORAGE_KEY = "avaliacao-imoveis-previsualizacao-v1";

function makeComparable(index: number, factorCount: number): Comparable {
  const baseFactors = [1.08, 1.02, 0.96, 1.05, 0.98];

  return {
    description: `Comparável ${index + 1}`,
    area: String(78 + index * 11),
    value: String(412000 + index * 31500),
    factors: Array.from({ length: factorCount }, (_, factorIndex) => {
      const seed = baseFactors[(index + factorIndex) % baseFactors.length];
      return seed.toFixed(2);
    }),
  };
}

function makeComparables(count: number, factorCount: number): Comparable[] {
  return Array.from({ length: count }, (_, index) => makeComparable(index, factorCount));
}

function resizeFactors(factors: string[], factorCount: number): string[] {
  const next = [...factors];

  while (next.length < factorCount) {
    next.push("1.00");
  }

  return next.slice(0, factorCount);
}

function resizeComparables(comparables: Comparable[], count: number, factorCount: number): Comparable[] {
  const next = [...comparables.slice(0, count)];

  while (next.length < count) {
    next.push(makeComparable(next.length, factorCount));
  }

  return next.map((item, index) => ({
    ...item,
    description: item.description || `Comparável ${index + 1}`,
    factors: resizeFactors(item.factors, factorCount),
  }));
}

function parseNumber(value: string): number {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyPerM2(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${formatCurrency(value)}/m²`;
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function mean(values: number[]) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function erf(x: number) {
  const sign = Math.sign(x) || 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return sign * y;
}

function normalCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function loadSavedState(): SavedState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      activeStep: parsed.activeStep ?? 1,
      comparableCount: parsed.comparableCount ?? 3,
      factorCount: parsed.factorCount ?? 3,
      targetDescription: parsed.targetDescription ?? "Apartamento avaliando",
      targetArea: parsed.targetArea ?? "82",
      comparables: Array.isArray(parsed.comparables) ? (parsed.comparables as Comparable[]) : makeComparables(3, 3),
    };
  } catch {
    return null;
  }
}

function App() {
  const saved = useMemo(loadSavedState, []);

  const [activeStep, setActiveStep] = useState(saved?.activeStep ?? 1);
  const [comparableCount, setComparableCount] = useState(saved?.comparableCount ?? 3);
  const [factorCount, setFactorCount] = useState(saved?.factorCount ?? 3);
  const [targetDescription, setTargetDescription] = useState(
    saved?.targetDescription ?? "Apartamento avaliando em prédio padrão",
  );
  const [targetArea, setTargetArea] = useState(saved?.targetArea ?? "82");
  const [comparables, setComparables] = useState<Comparable[]>(() => {
    if (saved?.comparables?.length) return saved.comparables;
    return makeComparables(3, 3);
  });

  useEffect(() => {
    setComparables((prev) => resizeComparables(prev, comparableCount, factorCount));
  }, [comparableCount, factorCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const state: SavedState = {
      activeStep,
      comparableCount,
      factorCount,
      targetDescription,
      targetArea,
      comparables,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [activeStep, comparableCount, comparables, factorCount, targetArea, targetDescription]);

  const targetAreaValue = parseNumber(targetArea);
  const validTargetArea = Number.isFinite(targetAreaValue) && targetAreaValue > 0;

  const samples = useMemo<Sample[]>(() => {
    return comparables.map((item, index) => {
      const area = parseNumber(item.area);
      const value = parseNumber(item.value);
      const factorValues = item.factors.map((factor) => parseNumber(factor));
      const description = item.description.trim() || `Comparável ${index + 1}`;

      const areaValid = Number.isFinite(area) && area > 0;
      const valueValid = Number.isFinite(value) && value > 0;
      const factorValid = factorValues.every((factor) => Number.isFinite(factor) && factor >= 0.5 && factor <= 1.5);

      if (!areaValid || !valueValid || !factorValid) {
        return {
          index,
          description,
          area: areaValid ? area : NaN,
          value: valueValid ? value : NaN,
          unitValue: NaN,
          factorProduct: NaN,
          adjustedUnitValue: NaN,
          accepted: false,
          expectedOccurrences: NaN,
          zScore: NaN,
          reason: !areaValid
            ? "Área inválida"
            : !valueValid
              ? "Valor inválido"
              : "Fator fora do intervalo 0,5 a 1,5",
        };
      }

      const factorProduct = factorValues.reduce((acc, factor) => acc * factor, 1);
      const unitValue = value / area;
      const adjustedUnitValue = unitValue * factorProduct;

      return {
        index,
        description,
        area,
        value,
        unitValue,
        factorProduct,
        adjustedUnitValue,
        accepted: true,
        expectedOccurrences: 0,
        zScore: 0,
      };
    });
  }, [comparables]);

  const calculation = useMemo(() => {
    const validSamples = samples.filter((sample) => sample.accepted);
    const adjustedValues = validSamples.map((sample) => sample.adjustedUnitValue);
    const averageAdjusted = mean(adjustedValues);
    const deviation = stdDev(adjustedValues);

    const classified = validSamples.map((sample) => {
      if (validSamples.length < 3 || deviation === 0) {
        return {
          ...sample,
          accepted: true,
          expectedOccurrences: validSamples.length,
          zScore: 0,
        };
      }

      const zScore = Math.abs(sample.adjustedUnitValue - averageAdjusted) / deviation;
      const expectedOccurrences = validSamples.length * (1 - normalCdf(zScore)) * 2;

      return {
        ...sample,
        accepted: expectedOccurrences >= 0.5,
        expectedOccurrences,
        zScore,
        reason: expectedOccurrences < 0.5 ? "Excluído pelo critério de Chauvenet" : undefined,
      };
    });

    const acceptedSamples = classified.filter((sample) => sample.accepted);
    const rejectedSamples = classified.filter((sample) => !sample.accepted);
    const acceptedValues = acceptedSamples.map((sample) => sample.adjustedUnitValue);
    const finalUnitValue = acceptedValues.length ? mean(acceptedValues) : averageAdjusted;
    const estimatedValue = validTargetArea ? finalUnitValue * targetAreaValue : NaN;
    const minAccepted = acceptedValues.length ? Math.min(...acceptedValues) : NaN;
    const maxAccepted = acceptedValues.length ? Math.max(...acceptedValues) : NaN;
    const coefficientOfVariation =
      acceptedValues.length > 1 && Number.isFinite(finalUnitValue) && finalUnitValue !== 0
        ? (stdDev(acceptedValues) / finalUnitValue) * 100
        : 0;

    return {
      validSamples: classified,
      acceptedSamples,
      rejectedSamples,
      finalUnitValue,
      estimatedValue,
      averageAdjusted,
      deviation,
      minAccepted,
      maxAccepted,
      coefficientOfVariation,
    };
  }, [samples, targetAreaValue, validTargetArea]);

  const reportText = useMemo(() => {
    if (!validTargetArea) return "Informe a área do imóvel avaliando para gerar o valor estimado.";
    if (!calculation.acceptedSamples.length) return "Nenhum comparável válido foi aceito para cálculo.";

    return [
      `Imóvel avaliando: ${targetDescription || "Sem descrição"}.`,
      `Foram aceitos ${calculation.acceptedSamples.length} comparáveis e excluídos ${calculation.rejectedSamples.length} pelo critério de Chauvenet.`,
      `Valor unitário final: ${formatCurrencyPerM2(calculation.finalUnitValue)}.`,
      `Valor de mercado estimado: ${formatCurrency(calculation.estimatedValue)}.`,
    ].join(" ");
  }, [calculation.acceptedSamples.length, calculation.estimatedValue, calculation.finalUnitValue, calculation.rejectedSamples.length, targetDescription, validTargetArea]);

  const targetBars = calculation.validSamples.filter((sample) => Number.isFinite(sample.adjustedUnitValue));
  const maxBarValue = Math.max(...targetBars.map((sample) => sample.adjustedUnitValue), calculation.finalUnitValue || 0, 1);

  function updateComparable(index: number, field: keyof Comparable, value: string) {
    setComparables((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function updateFactor(index: number, factorIndex: number, value: string) {
    setComparables((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) return item;
        const nextFactors = [...item.factors];
        nextFactors[factorIndex] = value;
        return { ...item, factors: nextFactors };
      }),
    );
  }

  function handlePrint() {
    window.print();
  }

  function jumpTo(step: number) {
    setActiveStep(step);
    const element = document.getElementById(`step-${step}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(67,56,202,0.22),_transparent_33%),radial-gradient(circle_at_80%_0%,_rgba(14,165,233,0.2),_transparent_30%),linear-gradient(180deg,#020617_0%,#08111f_45%,#0f172a_100%)] text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.32em] text-slate-200/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.14)]" />
              Pré-visualização offline
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.35em] text-cyan-300/80">Avaliação Imobiliária</p>
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Simule o laudo por comparação direta antes de levar o resultado ao relatório final.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Esta prévia replica o fluxo em 3 etapas: definir quantos comparáveis usar, preencher os fatores entre 0,5 e 1,5, e gerar um relatório com exclusão automática de outliers pelo critério de Chauvenet.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => jumpTo(1)}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-300 hover:-translate-y-0.5"
              >
                Editar dados
              </button>
              <button
                type="button"
                onClick={() => jumpTo(3)}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-transform duration-300 hover:-translate-y-0.5 hover:bg-white/10"
              >
                Ver relatório
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-full border border-sky-400/30 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-100 transition-transform duration-300 hover:-translate-y-0.5 hover:bg-sky-400/15"
              >
                Imprimir
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Etapa 1</div>
                <p className="mt-2 text-sm text-slate-200">Configuração da comparação</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Etapa 2</div>
                <p className="mt-2 text-sm text-slate-200">Dados do imóvel alvo e comparáveis</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Etapa 3</div>
                <p className="mt-2 text-sm text-slate-200">Relatório com exclusão Chauvenet</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl transition-transform duration-500 hover:-translate-y-1">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.1),_transparent_35%)]" />
            <div className="relative space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Prévia do laudo</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Resultado offline em tempo real</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  {calculation.acceptedSamples.length} aceitos
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Valor estimado do imóvel</p>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                      {formatCurrency(calculation.estimatedValue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Valor unitário final</p>
                    <div className="mt-2 text-lg font-medium text-cyan-200">
                      {formatCurrencyPerM2(calculation.finalUnitValue)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Comparáveis</div>
                    <div className="mt-2 text-xl font-semibold text-white">{samples.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Excluídos</div>
                    <div className="mt-2 text-xl font-semibold text-white">{calculation.rejectedSamples.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">CV</div>
                    <div className="mt-2 text-xl font-semibold text-white">{formatNumber(calculation.coefficientOfVariation, 1)}%</div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {calculation.validSamples.map((sample) => (
                    <div key={sample.index} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span className="truncate">{sample.description}</span>
                        <span className={sample.accepted ? "text-emerald-300" : "text-rose-300"}>
                          {sample.accepted ? "aceito" : "excluído"}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${sample.accepted ? "bg-gradient-to-r from-cyan-400 to-emerald-400" : "bg-gradient-to-r from-rose-400 to-amber-400"}`}
                          style={{ width: `${Math.max(10, (sample.adjustedUnitValue / maxBarValue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Metodologia</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Valor unitário = valor / área. Depois, multiplicamos pelos fatores informados e removemos extremos com Chauvenet antes de estimar o valor do alvo.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Situação</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{reportText}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="step-1" className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur md:p-7 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Etapa 1</p>
            <h2 className="text-2xl font-semibold text-white">Definir a comparação</h2>
            <p className="text-sm leading-6 text-slate-300">
              Escolha quantos imóveis comparáveis serão usados e quantos fatores vão entrar no cálculo. O app ajusta os campos automaticamente.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Quantidade de comparáveis</span>
              <input
                type="number"
                min={1}
                max={8}
                value={comparableCount}
                onChange={(event) => setComparableCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Quantidade de fatores</span>
              <input
                type="number"
                min={1}
                max={6}
                value={factorCount}
                onChange={(event) => setFactorCount(Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">Resumo da configuração</p>
                  <p className="mt-1 text-sm text-slate-400">Cada fator precisa ficar entre 0,5 e 1,5.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setComparableCount(3);
                    setFactorCount(3);
                    setTargetDescription("Apartamento avaliando em prédio padrão");
                    setTargetArea("82");
                    setComparables(makeComparables(3, 3));
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Recarregar exemplo
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="step-2" className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur md:p-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Etapa 2</p>
              <h2 className="text-2xl font-semibold text-white">Preencher os dados do imóvel e dos comparáveis</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">
                O cálculo roda offline, então você consegue testar cenários sem depender do site. Os campos de fator aceitam apenas 0,5 a 1,5.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => jumpTo(3)}
                className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5"
              >
                Ir para o relatório
              </button>
            </div>
          </div>

          <div className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-200">Descrição do imóvel avaliando</span>
              <textarea
                rows={3}
                value={targetDescription}
                onChange={(event) => setTargetDescription(event.target.value)}
                className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
                placeholder="Ex.: Apartamento com 3 quartos, 82 m², padrão médio"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Área do imóvel avaliando (m²)</span>
              <input
                type="text"
                value={targetArea}
                onChange={(event) => setTargetArea(event.target.value)}
                inputMode="decimal"
                className={`w-full rounded-2xl border bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70 ${validTargetArea ? "border-white/10" : "border-rose-400/60"}`}
                placeholder="82"
              />
            </label>

            <div className="flex items-end rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              A estimativa final será calculada sobre a média dos valores unitários aceitos.
            </div>
          </div>

          <div className="space-y-5">
            {comparables.map((item, index) => {
              const sample = calculation.validSamples[index];
              return (
                <div key={index} className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Comparável {index + 1}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Dados do comparável</h3>
                    </div>

                    {sample?.reason ? (
                      <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-200">
                        {sample.reason}
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                        Usado no cálculo
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-12">
                    <label className="space-y-2 lg:col-span-5">
                      <span className="text-sm font-medium text-slate-200">Descrição</span>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(event) => updateComparable(index, "description", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
                        placeholder="Descrição do comparável"
                      />
                    </label>

                    <label className="space-y-2 lg:col-span-3">
                      <span className="text-sm font-medium text-slate-200">Área (m²)</span>
                      <input
                        type="text"
                        value={item.area}
                        onChange={(event) => updateComparable(index, "area", event.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
                        placeholder="80"
                      />
                    </label>

                    <label className="space-y-2 lg:col-span-4">
                      <span className="text-sm font-medium text-slate-200">Valor (R$)</span>
                      <input
                        type="text"
                        value={item.value}
                        onChange={(event) => updateComparable(index, "value", event.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
                        placeholder="420000"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-100">Fatores de ajuste</p>
                      <p className="text-xs text-slate-400">Intervalo permitido: 0,5 a 1,5</p>
                    </div>

                    <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${factorCount}, minmax(0, 1fr))` }}>
                      {item.factors.map((factor, factorIndex) => (
                        <label key={factorIndex} className="space-y-2">
                          <span className="text-xs uppercase tracking-[0.24em] text-slate-500">Fator {factorIndex + 1}</span>
                          <input
                            type="text"
                            value={factor}
                            onChange={(event) => updateFactor(index, factorIndex, event.target.value)}
                            inputMode="decimal"
                            className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70"
                            placeholder="1.00"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Valor/m²</div>
                        <div className="mt-2 font-semibold text-white">{formatCurrencyPerM2(sample?.unitValue ?? NaN)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Produto dos fatores</div>
                        <div className="mt-2 font-semibold text-white">{formatNumber(sample?.factorProduct ?? NaN, 4)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Valor ajustado/m²</div>
                        <div className="mt-2 font-semibold text-white">{formatCurrencyPerM2(sample?.adjustedUnitValue ?? NaN)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Status</div>
                        <div className={`mt-2 font-semibold ${sample?.accepted ? "text-emerald-300" : "text-rose-300"}`}>
                          {sample?.accepted ? "Aceito" : sample?.reason ?? "Pendente"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="step-3" className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur md:p-7 lg:grid-cols-[1fr_330px]">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Etapa 3</p>
              <h2 className="text-2xl font-semibold text-white">Relatório final da avaliação</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">
                O relatório abaixo é uma prévia pronta para ser exportada depois. Ele resume os comparáveis, os excluídos, o valor unitário final e o valor de mercado estimado.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Valor estimado</p>
                <div className="mt-3 text-2xl font-semibold text-white">{formatCurrency(calculation.estimatedValue)}</div>
                <p className="mt-2 text-sm text-slate-400">Resultado final do imóvel avaliando</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Intervalo aceito</p>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {formatCurrencyPerM2(calculation.minAccepted)} a {formatCurrencyPerM2(calculation.maxAccepted)}
                </div>
                <p className="mt-2 text-sm text-slate-400">Faixa dos comparáveis após o filtro</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Chauvenet</p>
                <div className="mt-3 text-2xl font-semibold text-white">{calculation.rejectedSamples.length} excluído(s)</div>
                <p className="mt-2 text-sm text-slate-400">Casos fora do padrão são removidos automaticamente</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70">
              <div className="border-b border-white/10 px-5 py-4 text-sm font-medium text-slate-200">Relatório resumido</div>
              <div className="space-y-4 p-5 text-sm leading-7 text-slate-300">
                <p>{reportText}</p>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Fórmula aplicada</p>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-200">
{`Valor unitário = Valor / Área
Valor ajustado = Valor unitário x Fator 1 x Fator 2 x ...
Valor estimado = média dos aceitos x Área do imóvel avaliando`}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Observação</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Esta é uma implementação offline e transparente. Se você quiser, eu também posso ajustar o peso de cada fator ou trocar a regra de média para reproduzir uma planilha específica.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Ações</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Exportar a prévia</h3>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5"
            >
              Imprimir laudo
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reportText);
                } catch {
                  // Fallback silencioso: a prévia continua funcionando mesmo sem clipboard.
                }
              }}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Copiar texto do relatório
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
              <p className="font-medium text-white">O que esta versão já faz</p>
              <ul className="mt-3 space-y-2">
                <li>• Define quantos comparáveis e quantos fatores serão usados.</li>
                <li>• Calcula valor unitário, ajuste por fatores e valor estimado.</li>
                <li>• Remove outliers pelo critério de Chauvenet.</li>
                <li>• Mantém tudo salvo localmente no navegador.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              <p className="font-semibold text-white">Para usar no GitHub</p>
              <p className="mt-2 text-amber-50/90">
                Depois de enviar o código para um repositório, você pode ativar GitHub Pages ou apenas compartilhar o link do repositório com quem for revisar a prévia.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;
