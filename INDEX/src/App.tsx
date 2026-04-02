import { useState, useEffect } from 'react';

interface Property {
  id: number;
  description: string;
  area: number;
  value: number;
  factors: number[];
}

interface AppraisalData {
  targetProperty: {
    description: string;
    area: number;
  };
  comparableProperties: Property[];
  factors: string[];
  factorValues: number[];
  numberOfComparables: number;
  numberOfFactors: number;
}

interface CalculationResult {
  unitValue: number;
  totalValue: number;
  factorCorrection: number;
  outlierExcluded: boolean;
  standardDeviation: number;
  meanValue: number;
}

export default function App() {
  const [step, setStep] = useState(1);
  const [numberOfComparables, setNumberOfComparables] = useState(3);
  const [numberOfFactors, setNumberOfFactors] = useState(4);
  const [factors, setFactors] = useState<string[]>(['Localização', 'Estado de Conservação', 'Idade', 'Benefícios']);
  const [targetProperty, setTargetProperty] = useState({ description: '', area: 0 });
  const [comparableProperties, setComparableProperties] = useState<Property[]>([]);
  const [factorValues, setFactorValues] = useState<number[]>([1, 1, 1, 1]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [report, setReport] = useState<string>('');

  useEffect(() => {
    // Inicializa propriedades comparáveis quando número muda
    const newProps: Property[] = [];
    for (let i = 0; i < numberOfComparables; i++) {
      newProps.push({
        id: i + 1,
        description: `Imóvel Comparável ${i + 1}`,
        area: 0,
        value: 0,
        factors: Array(numberOfFactors).fill(1)
      });
    }
    setComparableProperties(newProps);
    
    // Atualiza fatores
    const newFactors: string[] = [];
    for (let i = 0; i < numberOfFactors; i++) {
      newFactors.push(factors[i] || `Fator ${i + 1}`);
    }
    setFactors(newFactors);
    
    // Atualiza valores dos fatores
    const newFactorValues: number[] = [];
    for (let i = 0; i < numberOfFactors; i++) {
      newFactorValues.push(factorValues[i] || 1);
    }
    setFactorValues(newFactorValues);
  }, [numberOfComparables, numberOfFactors]);

  const calculateUnitValues = () => {
    const unitValues: number[] = [];
    
    comparableProperties.forEach(prop => {
      if (prop.area > 0 && prop.value > 0) {
        let adjustedValue = prop.value;
        
        // Aplica fatores de correção do imóvel comparável
        prop.factors.forEach((factor, idx) => {
          if (idx < factorValues.length) {
            adjustedValue *= factor / factorValues[idx];
          }
        });
        
        const unitValue = adjustedValue / prop.area;
        unitValues.push(unitValue);
      }
    });
    
    return unitValues;
  };

  const calculateStandardDeviation = (values: number[]): number => {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  };

  const chauvenetCriterion = (values: number[]): { filtered: number[], excluded: boolean } => {
    if (values.length < 3) return { filtered: values, excluded: false };
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = calculateStandardDeviation(values);
    
    // Critério de Chauvenet: rejeita valores além de ±2σ para n=3-10
    const threshold = 2.0;
    const filtered = values.filter(v => Math.abs(v - mean) <= threshold * stdDev);
    
    return {
      filtered: filtered.length > 1 ? filtered : values,
      excluded: filtered.length < values.length
    };
  };

  const handleStep1Continue = () => {
    setStep(2);
  };

  const handleStep2Continue = () => {
    // Validação
    if (!targetProperty.description || targetProperty.area <= 0) {
      alert('Preencha corretamente os dados do imóvel a ser avaliado.');
      return;
    }
    
    const validComparables = comparableProperties.filter(p => p.area > 0 && p.value > 0);
    if (validComparables.length < 2) {
      alert('Preencha pelo menos 2 imóveis comparáveis com área e valor válidos.');
      return;
    }
    
    // Cálculo
    const unitValues = calculateUnitValues();
    const chauvenet = chauvenetCriterion(unitValues);
    
    const meanValue = chauvenet.filtered.reduce((a, b) => a + b, 0) / chauvenet.filtered.length;
    const stdDev = calculateStandardDeviation(chauvenet.filtered);
    
    // Fator de correção global
    let globalFactor = 1;
    factorValues.forEach(fv => {
      if (fv > 0) globalFactor *= fv;
    });
    
    const unitValue = meanValue * globalFactor;
    const totalValue = unitValue * targetProperty.area;
    
    setResult({
      unitValue,
      totalValue,
      factorCorrection: globalFactor,
      outlierExcluded: chauvenet.excluded,
      standardDeviation: stdDev,
      meanValue
    });
    
    // Gerar relatório
    generateReport(unitValue, totalValue, chauvenet);
    setStep(3);
  };

  const generateReport = (unitValue: number, totalValue: number, chauvenet: { filtered: number[], excluded: boolean }) => {
    const today = new Date().toLocaleDateString('pt-BR');
    const reportText = `
RELATÓRIO DE AVALIAÇÃO IMOBILIÁRIA
===================================

Data: ${today}
Avaliador: Sistema Automático NBR-14653

IMÓVEL AVALIADO:
----------------
Descrição: ${targetProperty.description}
Área: ${targetProperty.area.toFixed(2)} m²

IMÓVEIS COMPARADOS:
-------------------
${comparableProperties.filter(p => p.area > 0 && p.value > 0).map((p, i) => 
  `${i + 1}. ${p.description} - ${p.area.toFixed(2)}m² - R$ ${p.value.toLocaleString('pt-BR')}`
).join('\n')}

METODOLOGIA:
------------
- Norma: NBR-14653 (Avaliação de Bens)
- Método: Comparativo Direto de Mercado
- Critério Estatístico: Chauvenet (exclusão de outliers)

RESULTADOS:
-----------
Valor Unitário Médio: R$ ${unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /m²
Fator de Correção Global: ${result?.factorCorrection.toFixed(4)}
Desvio Padrão: R$ ${result?.standardDeviation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

${chauvenet.excluded ? '⚠️ Foram excluídos valores atípicos conforme Critério de Chauvenet.\n' : '✓ Todos os dados foram considerados (sem outliers detectados).\n'}

VALOR FINAL DA AVALIAÇÃO:
-------------------------
R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

(${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} reais)

OBSERVAÇÕES:
------------
- Este relatório é gerado automaticamente
- Recomenda-se vistoria técnica para confirmação
- Valores sujeitos a atualização de mercado

===================================
Gerado por: Sistema de Avaliação Imobiliária
    `;
    setReport(reportText);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const blob = new Blob([report], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avaliacao-imovel.doc';
    a.click();
  };

  const handleShareWhatsapp = () => {
    const text = encodeURIComponent(report);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent('Relatório de Avaliação Imobiliária');
    const body = encodeURIComponent(report);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const handleSave = () => {
    const data: AppraisalData = {
      targetProperty,
      comparableProperties,
      factors,
      factorValues,
      numberOfComparables,
      numberOfFactors
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avaliacao-salva.json';
    a.click();
  };

  const handleLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          setTargetProperty(data.targetProperty);
          setComparableProperties(data.comparableProperties);
          setFactors(data.factors);
          setFactorValues(data.factorValues);
          setNumberOfComparables(data.numberOfComparables);
          setNumberOfFactors(data.numberOfFactors);
          alert('Dados carregados com sucesso!');
        } catch {
          alert('Erro ao carregar arquivo.');
        }
      };
      reader.readAsText(file);
    }
  };

  const updateComparableProperty = (index: number, field: keyof Property, value: any) => {
    const updated = [...comparableProperties];
    updated[index] = { ...updated[index], [field]: value };
    setComparableProperties(updated);
  };

  const updateComparableFactor = (propIndex: number, factorIndex: number, value: number) => {
    const updated = [...comparableProperties];
    updated[propIndex].factors[factorIndex] = Math.max(0.5, Math.min(1.5, value));
    setComparableProperties(updated);
  };

  const updateGlobalFactor = (index: number, value: number) => {
    const updated = [...factorValues];
    updated[index] = Math.max(0.5, Math.min(1.5, value));
    setFactorValues(updated);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
          <h1 className="text-3xl font-bold text-white text-center mb-2">
            🏠 Avaliação de Imóveis - NBR-14653
          </h1>
          <p className="text-blue-200 text-center">
            Método Comparativo Direto com Critério de Chauvenet
          </p>
        </header>

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`px-6 py-3 rounded-full font-bold ${step >= 1 ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
              Etapa 1: Configuração
            </div>
            <div className="w-12 h-1 bg-gray-600"></div>
            <div className={`px-6 py-3 rounded-full font-bold ${step >= 2 ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
              Etapa 2: Dados
            </div>
            <div className="w-12 h-1 bg-gray-600"></div>
            <div className={`px-6 py-3 rounded-full font-bold ${step >= 3 ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
              Etapa 3: Resultado
            </div>
          </div>
        </div>

        {/* Step 1: Configuração */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">⚙️ Configuração da Avaliação</h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-gray-700 font-semibold mb-2">
                  Número de Imóveis Comparáveis
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={numberOfComparables}
                  onChange={(e) => setNumberOfComparables(parseInt(e.target.value) || 3)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-lg transition"
                />
                <p className="text-sm text-gray-500 mt-1">Mínimo: 2, Máximo: 10</p>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-2">
                  Número de Fatores de Correção
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={numberOfFactors}
                  onChange={(e) => setNumberOfFactors(parseInt(e.target.value) || 4)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-lg transition"
                />
                <p className="text-sm text-gray-500 mt-1">Mínimo: 1, Máximo: 10</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 font-semibold mb-3">
                Fatores de Correção
              </label>
              <div className="grid md:grid-cols-2 gap-3">
                {factors.map((factor, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-gray-600">{idx + 1}.</span>
                    <input
                      type="text"
                      value={factor}
                      onChange={(e) => {
                        const updated = [...factors];
                        updated[idx] = e.target.value;
                        setFactors(updated);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder={`Nome do fator ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-800 mb-2">ℹ️ Informações Importantes:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Os fatores de correção devem variar entre 0,5 e 1,5</li>
                <li>• Valor 1,0 = fator neutro (imóveis equivalentes)</li>
                <li>• Valores &gt; 1,0 = imóvel comparável melhor que o avaliado</li>
                <li>• Valores &lt; 1,0 = imóvel comparável pior que o avaliado</li>
              </ul>
            </div>

            <button
              onClick={handleStep1Continue}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-purple-700 transition shadow-lg"
            >
              CONTINUAR →
            </button>
          </div>
        )}

        {/* Step 2: Dados */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Imóvel Avaliado */}
            <div className="bg-white rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">🏠 Imóvel a ser Avaliado</h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Descrição</label>
                  <input
                    type="text"
                    value={targetProperty.description}
                    onChange={(e) => setTargetProperty({ ...targetProperty, description: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    placeholder="Ex: Apartamento 2 quartos, centro"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Área (m²)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetProperty.area || ''}
                    onChange={(e) => setTargetProperty({ ...targetProperty, area: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    placeholder="Ex: 75.50"
                  />
                </div>
              </div>

              {/* Fatores Globais */}
              <div className="mt-6">
                <h3 className="font-bold text-gray-800 mb-3">Fatores de Correção Globais (Referência)</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {factors.map((factor, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <span className="text-gray-600 text-sm flex-1">{factor}:</span>
                      <input
                        type="number"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={factorValues[idx]}
                        onChange={(e) => updateGlobalFactor(idx, parseFloat(e.target.value) || 1)}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Imóveis Comparáveis */}
            <div className="bg-white rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">🏘️ Imóveis Comparáveis</h2>
              
              {comparableProperties.map((prop, propIdx) => (
                <div key={prop.id} className="border-2 border-gray-200 rounded-xl p-5 mb-4 hover:border-blue-300 transition">
                  <h3 className="font-bold text-lg text-blue-700 mb-3">Imóvel Comparável {propIdx + 1}</h3>
                  
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="md:col-span-3">
                      <label className="block text-gray-700 font-semibold mb-2">Descrição</label>
                      <input
                        type="text"
                        value={prop.description}
                        onChange={(e) => updateComparableProperty(propIdx, 'description', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Ex: Casa 3 quartos, bairro X"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Área (m²)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={prop.area || ''}
                        onChange={(e) => updateComparableProperty(propIdx, 'area', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Valor de Venda (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={prop.value || ''}
                        onChange={(e) => updateComparableProperty(propIdx, 'value', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Valor/m²</label>
                      <div className="px-4 py-3 bg-gray-100 rounded-lg font-bold text-gray-700">
                        {prop.area > 0 && prop.value > 0 
                          ? `R$ ${(prop.value / prop.area).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '—'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Fatores do Imóvel Comparável */}
                  <div className="mt-4">
                    <label className="block text-gray-700 font-semibold mb-2">Fatores do Imóvel (0,5 - 1,5)</label>
                    <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {factors.map((factor, factorIdx) => (
                        <div key={factorIdx} className="flex items-center space-x-2">
                          <span className="text-gray-600 text-xs flex-1">{factor}:</span>
                          <input
                            type="number"
                            min="0.5"
                            max="1.5"
                            step="0.1"
                            value={prop.factors[factorIdx] || 1}
                            onChange={(e) => updateComparableFactor(propIdx, factorIdx, parseFloat(e.target.value) || 1)}
                            className="w-20 px-2 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-700 transition"
              >
                ← VOLTAR
              </button>
              <button
                onClick={handleStep2Continue}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition shadow-lg"
              >
                CALCULAR →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Resultado */}
        {step === 3 && result && (
          <div className="space-y-6">
            {/* Card de Resultado Principal */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 shadow-2xl text-white">
              <h2 className="text-3xl font-bold text-center mb-4">📊 RESULTADO DA AVALIAÇÃO</h2>
              
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="bg-white/20 backdrop-blur rounded-xl p-6">
                  <p className="text-green-100 text-sm mb-1">VALOR UNITÁRIO</p>
                  <p className="text-3xl font-bold">
                    R$ {result.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /m²
                  </p>
                </div>
                
                <div className="bg-white/20 backdrop-blur rounded-xl p-6">
                  <p className="text-green-100 text-sm mb-1">VALOR TOTAL AVALIADO</p>
                  <p className="text-4xl font-bold">
                    R$ {result.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {result.outlierExcluded && (
                <div className="mt-4 bg-yellow-500/30 backdrop-blur rounded-lg p-4">
                  <p className="font-semibold">⚠️ Critério de Chauvenet aplicado: valores atípicos foram excluídos do cálculo.</p>
                </div>
              )}
            </div>

            {/* Estatísticas */}
            <div className="bg-white rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-gray-800 mb-4">📈 Estatísticas do Cálculo</h3>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-blue-700 text-sm">Valor Unitário Médio</p>
                  <p className="text-2xl font-bold text-blue-900">
                    R$ {result.meanValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-purple-700 text-sm">Desvio Padrão</p>
                  <p className="text-2xl font-bold text-purple-900">
                    R$ {result.standardDeviation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-green-700 text-sm">Fator de Correção</p>
                  <p className="text-2xl font-bold text-green-900">
                    {result.factorCorrection.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Valores por m² de cada comparável */}
              <div className="mt-6">
                <h4 className="font-bold text-gray-700 mb-3">Valores Unitários dos Comparáveis:</h4>
                <div className="space-y-2">
                  {calculateUnitValues().map((uv, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2">
                      <span className="text-gray-600">Imóvel {idx + 1}:</span>
                      <span className="font-bold text-gray-800">
                        R$ {uv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /m²
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Relatório Completo */}
            <div className="bg-white rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-gray-800 mb-4">📄 Relatório Completo</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{report}</pre>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={handlePrint}
                className="bg-blue-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
              >
                🖨️ Imprimir
              </button>
              
              <button
                onClick={handleExportWord}
                className="bg-green-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                📝 Exportar Word
              </button>
              
              <button
                onClick={handleShareWhatsapp}
                className="bg-green-500 text-white py-3 px-6 rounded-xl font-bold hover:bg-green-600 transition flex items-center justify-center gap-2"
              >
                💬 WhatsApp
              </button>
              
              <button
                onClick={handleShareEmail}
                className="bg-purple-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-purple-700 transition flex items-center justify-center gap-2"
              >
                📧 E-mail
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={handleSave}
                className="bg-gray-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-gray-700 transition flex items-center justify-center gap-2"
              >
                💾 Salvar no Computador
              </button>
              
              <label className="bg-gray-500 text-white py-3 px-6 rounded-xl font-bold hover:bg-gray-600 transition flex items-center justify-center gap-2 cursor-pointer">
                📂 Carregar Arquivo
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoad}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={() => {
                setStep(1);
                setResult(null);
                setReport('');
              }}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 rounded-xl font-bold text-lg hover:from-orange-600 hover:to-red-600 transition shadow-lg"
            >
              🔄 Nova Avaliação
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-blue-200 text-sm">
          <p>Sistema de Avaliação Imobiliária - Conformidade NBR-14653</p>
          <p className="mt-1 text-xs">Os cálculos utilizam o Critério de Chauvenet para exclusão estatística de outliers</p>
        </footer>
      </div>
    </div>
  );
}
