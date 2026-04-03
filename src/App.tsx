import { useEffect, useMemo, useState } from "react";

type FactorRow = {
  name: string;
};

type ComparableRow = {
  description: string;
  area: string;
  value: string;
  factors: string[];
};

type RowResult = {
  index: number;
  description: string;
  area: number;
  value: number;
  unitValue: number;
  factorProduct: number;
  adjustedUnitValue: number;
  zScore: number;
  kept: boolean;
};

type CalcResult = {
  targetDescription: string;
  targetArea: number;
  rowResults: RowResult[];
  meanAdjustedUnitValue: number;
  estimatedValue: number;
  thresholdZ: number;
  keptCount: number;
  excludedCount: number;
};

const DEFAULT_FACTOR_NAMES = ["Localização", "Padrão de acabamento", "Estado de conservação", "Oferta", "Liquidez"];

function clampInt(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) {
    return Number.NaN;
  }
  return Number(normalized);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function inverseNormalCDF(p: number) {
  if (p <= 0 || p >= 1) {
    throw new Error("Probabilidade inválida para o cálculo de Chauvenet.");
  }

  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;

  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }

  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (
    (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
    (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
  );
}

function createFactorRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: DEFAULT_FACTOR_NAMES[index] ?? `Fator ${index + 1}`,
  }));
}

function createComparableRows(count: number, factorCount: number) {
  return Array.from({ length: count }, () => ({
    description: "",
    area: "",
    value: "",
    factors: Array.from({ length: factorCount }, () => ""),
  }));
}

function resizeComparables(rows: ComparableRow[], comparableCount: number, factorCount: number) {
  const nextRows = rows.slice(0, comparableCount).map((row) => ({
    ...row,
    factors: row.factors.slice(0, factorCount).concat(Array.from({ length: Math.max(factorCount - row.factors.length, 0) }, () => "")),
  }));

  while (nextRows.length < comparableCount) {
    nextRows.push({
      description: "",
      area: "",
      value: "",
      factors: Array.from({ length: factorCount }, () => ""),
    });
  }

  return nextRows;
}

function App() {
  const [comparableCount, setComparableCount] = useState(3);
  const [factorCount, setFactorCount] = useState(3);
  const [targetDescription, setTargetDescription] = useState("");
  const [targetArea, setTargetArea] = useState("");
  const [factors, setFactors] = useState<FactorRow[]>(() => createFactorRows(3));
  const [comparables, setComparables] = useState<ComparableRow[]>(() => createComparableRows(3, 3));
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setFactors((current) => {
      const next = current.slice(0, factorCount);

      while (next.length < factorCount) {
        next.push({
          name: DEFAULT_FACTOR_NAMES[next.length] ?? `Fator ${next.length + 1}`,
        });
      }

      return next;
    });

    setComparables((current) => resizeComparables(current, comparableCount, factorCount));
    setResult(null);
    setError("");
  }, [comparableCount, factorCount]);

  const computedPreview = useMemo(() => {
    const targetAreaValue = toNumber(targetArea);
    const rows = comparables.map((row, index) => {
      const area = toNumber(row.area);
      const value = toNumber(row.value);
      const factorValues = row.factors.map((item) => toNumber(item));
      const allNumbers = Number.isFinite(area) && Number.isFinite(value) && area > 0 && value > 0 && factorValues.every((item) => Number.isFinite(item));

      if (!allNumbers) {
        return {
          index,
          adjustedUnitValue: Number.NaN,
          factorProduct: Number.NaN,
          unitValue: Number.NaN,
        };
      }

      const factorProduct = factorValues.reduce((acc, valueItem) => acc * valueItem, 1);
      const unitValue = value / area;
      return {
        index,
        adjustedUnitValue: unitValue * factorProduct,
        factorProduct,
        unitValue,
      };
    });

    const validAdjusted = rows.map((row) => row.adjustedUnitValue).filter((item) => Number.isFinite(item));
    const averageAdjusted = validAdjusted.length ? mean(validAdjusted) : Number.NaN;

    return {
      targetAreaValue,
      rows,
      averageAdjusted,
    };
  }, [comparables, targetArea]);

  function updateFactorName(index: number, name: string) {
    setFactors((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, name } : item)));
  }

  function updateComparable(index: number, field: keyof Omit<ComparableRow, "factors">, value: string) {
    setComparables((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)));
  }

  function updateComparableFactor(comparableIndex: number, factorIndex: number, value: string) {
    setComparables((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== comparableIndex) {
          return item;
        }

        const nextFactors = item.factors.map((factorValue, currentFactorIndex) =>
          currentFactorIndex === factorIndex ? value : factorValue,
        );

        return { ...item, factors: nextFactors };
      }),
    );
  }

  function calculate() {
    const parsedTargetArea = toNumber(targetArea);

    if (!Number.isFinite(parsedTargetArea) || parsedTargetArea <= 0) {
      setError("Informe uma área válida maior que zero para o imóvel avaliando.");
      setResult(null);
      return;
    }

    const parsedRows: RowResult[] = [];

    for (const [index, comparable] of comparables.entries()) {
      const area = toNumber(comparable.area);
      const value = toNumber(comparable.value);
      const factorsValues = comparable.factors.map((item) => toNumber(item));

      if (!Number.isFinite(area) || area <= 0) {
        setError(`A área do comparável ${index + 1} precisa ser maior que zero.`);
        setResult(null);
        return;
      }

      if (!Number.isFinite(value) || value <= 0) {
        setError(`O valor do comparável ${index + 1} precisa ser maior que zero.`);
        setResult(null);
        return;
      }

      for (const [factorIndex, factorValue] of factorsValues.entries()) {
        if (!Number.isFinite(factorValue)) {
          setError(`Preencha o fator ${factorIndex + 1} do comparável ${index + 1}.`);
          setResult(null);
          return;
        }

        if (factorValue < 0.5 || factorValue > 1.5) {
          setError(`O fator ${factorIndex + 1} do comparável ${index + 1} deve ficar entre 0,5 e 1,5.`);
          setResult(null);
          return;
        }
      }

      const factorProduct = factorsValues.reduce((acc, factorValue) => acc * factorValue, 1);
      const unitValue = value / area;

      parsedRows.push({
        index,
        description: comparable.description || `Comparável ${index + 1}`,
        area,
        value,
        unitValue,
        factorProduct,
        adjustedUnitValue: unitValue * factorProduct,
        zScore: 0,
        kept: true,
      });
    }

    const adjustedValues = parsedRows.map((row) => row.adjustedUnitValue);
    const adjustedMean = mean(adjustedValues);
    const adjustedSd = standardDeviation(adjustedValues);

    const thresholdZ = parsedRows.length > 1 ? inverseNormalCDF(1 - 1 / (4 * parsedRows.length)) : Number.POSITIVE_INFINITY;

    const withChauvenet = parsedRows.map((row) => {
      const zScore = adjustedSd === 0 ? 0 : Math.abs(row.adjustedUnitValue - adjustedMean) / adjustedSd;
      const kept = adjustedSd === 0 ? true : zScore <= thresholdZ;
      return { ...row, zScore, kept };
    });

    const keptRows = withChauvenet.filter((row) => row.kept);
    const rowsForAverage = keptRows.length > 0 ? keptRows : withChauvenet;
    const meanAdjustedUnitValue = mean(rowsForAverage.map((row) => row.adjustedUnitValue));
    const estimatedValue = meanAdjustedUnitValue * parsedTargetArea;

    setError("");
    setResult({
      targetDescription: targetDescription || "Imóvel avaliando",
      targetArea: parsedTargetArea,
      rowResults: withChauvenet,
      meanAdjustedUnitValue,
      estimatedValue,
      thresholdZ,
      keptCount: keptRows.length,
      excludedCount: withChauvenet.length - keptRows.length,
    });
  }

  const totalCurrentPreview = useMemo(() => {
    if (!Number.isFinite(computedPreview.targetAreaValue) || !Number.isFinite(computedPreview.averageAdjusted)) {
      return null;
    }

    return computedPreview.targetAreaValue * computedPreview.averageAdjusted;
  }, [computedPreview]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#f8fafc_100%)] text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
                Avaliação offline
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Comparação direta com fatores, pronta para rodar sem depender do site.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Configure a quantidade de comparáveis e fatores, nomeie cada fator, preencha os valores e clique em calcular para gerar a pré-visualização e o relatório com exclusão de Chauvenet.
                </p>
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:min-w-72">
              <div className="flex items-center justify-between gap-6">
                <span>Comparáveis</span>
                <strong className="text-slate-900">{comparableCount}</strong>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>Fatores</span>
                <strong className="text-slate-900">{factorCount}</strong>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>Status</span>
                <strong className={error ? "text-rose-600" : "text-emerald-600"}>{error ? "Atenção" : result ? "Calculado" : "Aguardando"}</strong>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Etapa 1</p>
                  <h2 className="text-xl font-semibold text-slate-900">Estrutura da análise</h2>
                </div>
                <p className="text-sm text-slate-500">Defina a quantidade de imóveis e fatores antes de preencher os dados.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Quantidade de imóveis comparáveis</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={comparableCount}
                    onChange={(event) => setComparableCount(clampInt(Number(event.target.value || 1), 1, 12))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Quantidade de fatores</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={factorCount}
                    onChange={(event) => setFactorCount(clampInt(Number(event.target.value || 1), 1, 8))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Etapa 2</p>
                  <h2 className="text-xl font-semibold text-slate-900">Dados do imóvel avaliando</h2>
                </div>
                <p className="text-sm text-slate-500">Use a descrição e a área do imóvel que será estimado.</p>
              </div>

              <div className="grid gap-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Descrição do imóvel avaliando</span>
                  <textarea
                    rows={3}
                    value={targetDescription}
                    onChange={(event) => setTargetDescription(event.target.value)}
                    placeholder="Ex.: apartamento residencial no Centro, 3 dormitórios, vaga, sol da manhã"
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>

                <label className="space-y-2 sm:max-w-sm">
                  <span className="text-sm font-medium text-slate-700">Área do imóvel avaliando (m2)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetArea}
                    onChange={(event) => setTargetArea(event.target.value)}
                    placeholder="Ex.: 82,5"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Etapa 2</p>
                  <h2 className="text-xl font-semibold text-slate-900">Nomeie os fatores e preencha os coeficientes</h2>
                </div>
                <p className="text-sm text-slate-500">Cada fator aceita valores entre 0,5 e 1,5.</p>
              </div>

              <div className="space-y-4">
                {factors.map((factor, factorIndex) => (
                  <div
                    key={`factor-${factorIndex}`}
                    className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[220px_minmax(0,1fr)]"
                  >
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nome do fator</span>
                      <input
                        type="text"
                        value={factor.name}
                        onChange={(event) => updateFactorName(factorIndex, event.target.value)}
                        placeholder="Ex.: localização"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {comparables.map((comparable, comparableIndex) => (
                        <label key={`factor-${factorIndex}-comparable-${comparableIndex}`} className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {comparable.description || `Comparável ${comparableIndex + 1}`}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={comparable.factors[factorIndex] ?? ""}
                            onChange={(event) => updateComparableFactor(comparableIndex, factorIndex, event.target.value)}
                            placeholder="0,95"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Etapa 2</p>
                  <h2 className="text-xl font-semibold text-slate-900">Dados dos comparáveis</h2>
                </div>
                <p className="text-sm text-slate-500">Informe descrição, área e valor de cada imóvel comparável.</p>
              </div>

              <div className="space-y-4">
                {comparables.map((comparable, index) => (
                  <div key={`comparable-${index}`} className="rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">Comparável {index + 1}</h3>
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Ajuste via {factorCount} fator{factorCount > 1 ? "es" : ""}
                      </span>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="space-y-2 lg:col-span-2">
                        <span className="text-sm font-medium text-slate-700">Descrição</span>
                        <textarea
                          rows={2}
                          value={comparable.description}
                          onChange={(event) => updateComparable(index, "description", event.target.value)}
                          placeholder="Ex.: apartamento semelhante no mesmo bairro"
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Área (m2)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={comparable.area}
                          onChange={(event) => updateComparable(index, "area", event.target.value)}
                          placeholder="Ex.: 75"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Valor (R$)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={comparable.value}
                          onChange={(event) => updateComparable(index, "value", event.target.value)}
                          placeholder="Ex.: 480000"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
                <button
                  type="button"
                  onClick={calculate}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 active:scale-[0.99]"
                >
                  Calcular avaliação
                </button>
                <p className="text-sm text-slate-500">O relatório será montado com os resultados finais e a exclusão de Chauvenet, se houver.</p>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pré-visualização</p>
                <h2 className="text-xl font-semibold text-slate-900">Leitura rápida do cálculo</h2>
              </div>

              <div className="space-y-4 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 font-medium text-slate-900">Fórmula usada</div>
                  <p>
                    Valor ajustado por m2 = (valor do comparável / área) x fator 1 x fator 2 x ... x fator n
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 font-medium text-slate-900">Resultado de referência</div>
                  <p>
                    {totalCurrentPreview !== null ? formatMoney(totalCurrentPreview) : "Preencha a área do imóvel avaliando e os comparáveis para ver a estimativa."}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 font-medium text-slate-900">Como os fatores entram</div>
                  <ul className="space-y-2">
                    {factors.map((factor, index) => (
                      <li key={`preview-factor-${index}`} className="flex items-start justify-between gap-3">
                        <span className="text-slate-600">{factor.name || `Fator ${index + 1}`}</span>
                        <span className="font-medium text-slate-900">0,50 a 1,50</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Etapa 3</p>
                <h2 className="text-xl font-semibold text-slate-900">Relatório final</h2>
              </div>

              {result ? (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-950 transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Valor estimado</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight">{formatMoney(result.estimatedValue)}</div>
                    <p className="mt-2 text-sm text-emerald-800">
                      Baseado em {result.keptCount} comparável{result.keptCount !== 1 ? "is" : ""} aceito{result.keptCount !== 1 ? "s" : ""} pelo critério de Chauvenet.
                    </p>
                  </div>

                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-slate-500">Área do imóvel</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatNumber(result.targetArea, 2)} m2</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-slate-500">Média ajustada</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatMoney(result.meanAdjustedUnitValue)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-slate-500">Comparáveis aceitos</div>
                      <div className="mt-1 font-semibold text-slate-900">{result.keptCount}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-slate-500">Excluídos</div>
                      <div className="mt-1 font-semibold text-slate-900">{result.excludedCount}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">Critério adotado</div>
                    <p className="mt-2 leading-6">
                      Chauvenet aplicado sobre os valores unitários ajustados. Limite z usado: {formatNumber(result.thresholdZ, 2)}.
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">Comparável</th>
                          <th className="px-4 py-3 font-medium">m2 bruto</th>
                          <th className="px-4 py-3 font-medium">m2 ajustado</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {result.rowResults.map((row) => (
                          <tr key={`result-row-${row.index}`} className={row.kept ? "" : "bg-rose-50/70"}>
                            <td className="px-4 py-3 text-slate-900">{row.description}</td>
                            <td className="px-4 py-3 text-slate-600">{formatMoney(row.unitValue)}</td>
                            <td className="px-4 py-3 text-slate-600">{formatMoney(row.adjustedUnitValue)}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.kept ? "Aceito" : "Excluído"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-100">
                    <div className="font-medium text-white">Resumo final</div>
                    <p className="mt-2 leading-6 text-slate-300">
                      {result.targetDescription}. Valor estimado final de {formatMoney(result.estimatedValue)} com base nos comparáveis aceitos.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                  O relatório aparece aqui após clicar em <strong className="text-slate-900">Calcular avaliação</strong>.
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;