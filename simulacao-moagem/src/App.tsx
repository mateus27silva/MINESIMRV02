import React, { useState, useRef, useEffect } from 'react';
import { 
  runSimulation, 
  calculateEconomics, 
  validateMassBalance,
  calculateMetallurgicalBalance,
  flotationMassBalanceWithComponents,
  SimulationResult,
  EconomicAnalysis,
  analyzeCircuitBalance,
  performSensitivityAnalysis,
  BalanceResult,
  IterativeResult,
  DetailedStream
} from './utils/calculations';

// Interfaces para os tipos de dados
interface Equipment {
  id: string;
  type: 'moinho' | 'britador' | 'rougher' | 'cleaner' | 'recleaner' | 'mixer';
  name: string;
  x: number;
  y: number;
  parameters: EquipmentParameters;
  inputs: string[];
  outputs: string[];
}

interface FlowLine {
  id: string;
  name: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
  length: number;
  flowRate: number;
  solidPercent: number;
  density: number;
  fromEquipment?: string;
  toEquipment?: string;
  fromPort?: number;
  toPort?: number;
  isFromInput?: boolean;
  isToInput?: boolean;
  isDrawing?: boolean;
  style?: 'solid' | 'dashed' | 'recycle';
  color?: string;
  particleSize?: number;
  pressure?: number;
  temperature?: number;
  components: string[]; // Array of component IDs present in this stream
  componentGrades: { [componentId: string]: number }; // % grade of each component
}

interface MineralComponent {
  id: string;
  name: string;
  symbol: string;
  color: string;
  density: number; // g/cm³
  specificDensity: number; // g/cm³ (mineral specific)
  workIndex: number; // Bond Work Index (kWh/t)
  abrasionIndex: number; // Bond Abrasion Index
  hardness: number; // Mohs scale
  liberation: number; // µm (liberation size)
  magnetism: 'magnetic' | 'weakly_magnetic' | 'non_magnetic';
  flotability: 'high' | 'medium' | 'low' | 'non_floatable';
  defaultGrade: number; // % typical grade in ore
  economicValue: number; // USD/% per ton
  isActive: boolean; // Whether to include in simulation
  chemicalElements?: { [element: string]: number }; // Chemical composition with element percentages
}

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success';
  category: 'equipment' | 'flow' | 'simulation' | 'component' | 'connection' | 
            'validation' | 'correction' | 'rigorous-analysis' | 'sensitivity' | 
            'metallurgy' | 'performance' | 'economics' | 'example';
  message: string;
  details?: string;
  equipmentId?: string;
  flowLineId?: string;
  action?: () => void; // Function to execute when log is clicked
}

interface ComponentsModal {
  isOpen: boolean;
}

interface EquipmentParameters {
  power?: number;
  diameter?: number;
  length?: number;
  ballLoad?: number;
  speed?: number;
  reduction?: number;
  feedSize?: number;
  productSize?: number;
  capacity?: number;
  cellVolume?: number;
  numberOfCells?: number;
  airFlow?: number;
  reagentDosage?: number;
  recovery?: number;
  grade?: number;
  numberOfInputs?: number;
  numberOfOutputs?: number;
  mixingTime?: number;
  efficiency?: number;
  // Componentes metalúrgicos
  components?: {
    [componentName: string]: {
      feedGrade: number;    // % do componente na alimentação
      concentrate: number;  // % do componente no concentrado
      tailing: number;     // % do componente no rejeito
      recovery: number;    // % de recuperação do componente
    };
  };
}

interface ContextMenu {
  x: number;
  y: number;
  equipmentId?: string;
  flowLineId?: string;
}

export default function SimulationApp() {
  const [currentPage, setCurrentPage] = useState('simulation');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [flowLines, setFlowLines] = useState<FlowLine[]>([]);
  const [nextEquipmentId, setNextEquipmentId] = useState(1);
  const [nextFlowLineId, setNextFlowLineId] = useState(1);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [editingFlowLine, setEditingFlowLine] = useState<FlowLine | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFlowEditModal, setShowFlowEditModal] = useState(false);
  const [drawingLine, setDrawingLine] = useState<FlowLine | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([]);
  const [economicResults, setEconomicResults] = useState<EconomicAnalysis | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [draggingEquipment, setDraggingEquipment] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showComponentsModal, setShowComponentsModal] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nextLogId, setNextLogId] = useState(1);
  const [showLogs, setShowLogs] = useState(true);
  const [rigorousAnalysis, setRigorousAnalysis] = useState<BalanceResult | null>(null);
  const [iterativeResult, setIterativeResult] = useState<IterativeResult | null>(null);
  const [detailedStreams, setDetailedStreams] = useState<DetailedStream[]>([]);
  const [coherenceReport, setCoherenceReport] = useState<string[]>([]);
  
  // Estados para controlar habilitação de módulos avançados
  const [economyEnabled, setEconomyEnabled] = useState(false);
  const [chartsEnabled, setChartsEnabled] = useState(false);
  const [optimizationEnabled, setOptimizationEnabled] = useState(false);
  
  // Estado para controlar visualização na tabela de resultados
  const [showMineralComponents, setShowMineralComponents] = useState(true);
  const [showPureElements, setShowPureElements] = useState(false);
  const [showAllChemicalElements, setShowAllChemicalElements] = useState(false);
  const [mineralComponents, setMineralComponents] = useState<MineralComponent[]>([
    {
      id: 'fe',
      name: 'Hematita',
      symbol: 'Fe₂O₃',
      color: '#8B4513',
      density: 5.3,
      specificDensity: 5.26,
      workIndex: 12.8,
      abrasionIndex: 0.35,
      hardness: 6.5,
      liberation: 50,
      magnetism: 'weakly_magnetic',
      flotability: 'medium',
      defaultGrade: 35,
      economicValue: 1.2,
      isActive: false,
      chemicalElements: { Fe: 0.6994, O: 0.3006 } // Fe₂O₃: 69.94% Fe, 30.06% O
    },
    {
      id: 'fe_mag',
      name: 'Magnetita',
      symbol: 'Fe₃O₄',
      color: '#2F4F4F',
      density: 5.18,
      specificDensity: 5.15,
      workIndex: 9.9,
      abrasionIndex: 0.28,
      hardness: 6.0,
      liberation: 45,
      magnetism: 'magnetic',
      flotability: 'low',
      defaultGrade: 25,
      economicValue: 1.2,
      isActive: false,
      chemicalElements: { Fe: 0.7236, O: 0.2764 } // Fe₃O₄: 72.36% Fe, 27.64% O
    },
    {
      id: 'sio2',
      name: 'Quartzo',
      symbol: 'SiO₂',
      color: '#F5F5DC',
      density: 2.65,
      specificDensity: 2.65,
      workIndex: 13.1,
      abrasionIndex: 0.15,
      hardness: 7.0,
      liberation: 75,
      magnetism: 'non_magnetic',
      flotability: 'low',
      defaultGrade: 45,
      economicValue: -0.5,
      isActive: false,
      chemicalElements: { Si: 0.4674, O: 0.5326 } // SiO₂: 46.74% Si, 53.26% O
    },
    {
      id: 'al2o3',
      name: 'Caulinita',
      symbol: 'Al₂O₃·2SiO₂·2H₂O',
      color: '#D2B48C',
      density: 2.6,
      specificDensity: 2.58,
      workIndex: 6.8,
      abrasionIndex: 0.08,
      hardness: 2.0,
      liberation: 25,
      magnetism: 'non_magnetic',
      flotability: 'non_floatable',
      defaultGrade: 12,
      economicValue: -0.3,
      isActive: false,
      chemicalElements: { Al: 0.3958, Si: 0.2185, O: 0.3282, H: 0.0575 } // Caulinita: 39.58% Al, 21.85% Si, 32.82% O, 5.75% H
    },
    {
      id: 'p',
      name: 'Apatita',
      symbol: 'Ca₅(PO₄)₃(OH,F,Cl)',
      color: '#FFE4B5',
      density: 3.2,
      specificDensity: 3.16,
      workIndex: 11.6,
      abrasionIndex: 0.12,
      hardness: 5.0,
      liberation: 35,
      magnetism: 'non_magnetic',
      flotability: 'high',
      defaultGrade: 0.8,
      economicValue: -2.0,
      isActive: false,
      chemicalElements: { Ca: 0.3969, P: 0.1840, O: 0.3796, H: 0.0200, F: 0.0195 } // Apatita: 39.69% Ca, 18.40% P, 37.96% O, 2.00% H, 1.95% F
    },
    {
      id: 'mn',
      name: 'Pirolusita',
      symbol: 'MnO₂',
      color: '#696969',
      density: 5.0,
      specificDensity: 4.95,
      workIndex: 10.5,
      abrasionIndex: 0.18,
      hardness: 6.5,
      liberation: 40,
      magnetism: 'weakly_magnetic',
      flotability: 'medium',
      defaultGrade: 2.5,
      economicValue: 0.8,
      isActive: false,
      chemicalElements: { Mn: 0.6315, O: 0.3685 } // MnO₂: 63.15% Mn, 36.85% O
    }
  ]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Logging system
  const addLog = (
    type: LogEntry['type'], 
    category: LogEntry['category'], 
    message: string, 
    details?: string,
    equipmentId?: string,
    flowLineId?: string,
    action?: () => void
  ) => {
    const newLog: LogEntry = {
      id: `LOG${nextLogId}`,
      timestamp: new Date(),
      type,
      category,
      message,
      details,
      equipmentId,
      flowLineId,
      action
    };
    
    setLogs(prev => [newLog, ...prev].slice(0, 100)); // Keep last 100 logs
    setNextLogId(prev => prev + 1);
  };

  // Simplified real-time validation (lightweight only)
  useEffect(() => {
    // Only basic validation without heavy analysis
    if (equipments.length > 0 || flowLines.length > 0) {
      // Clear previous validation logs
      setLogs(prev => prev.filter(log => log.category !== 'validation'));
      
      // Basic checks only
      const inputFlows = flowLines.filter(fl => !fl.fromEquipment);
      const outputFlows = flowLines.filter(fl => !fl.toEquipment);
      const disconnected = flowLines.filter(fl => !fl.fromEquipment || !fl.toEquipment);
      
      if (inputFlows.length === 0 && equipments.length > 0) {
        addLog('warning', 'validation', 'Configuração incompleta', 'Adicione correntes de alimentação');
      }
      
      if (outputFlows.length === 0 && equipments.length > 0) {
        addLog('warning', 'validation', 'Configuração incompleta', 'Adicione correntes de produto');
      }
      
      if (disconnected.length > 0) {
        addLog('info', 'validation', `${disconnected.length} correntes desconectadas`, 'Complete as conexões do fluxograma');
      }
      
      // Success only for complete circuits
      if (inputFlows.length > 0 && outputFlows.length > 0 && disconnected.length === 0) {
        addLog('success', 'validation', 'Fluxograma conectado', 'Pronto para simulação');
      }
    }
  }, [equipments.length, flowLines.length]); // Only trigger on count changes, not content

  // SIMPLIFIED CIRCUIT VALIDATION (no heavy analysis)
  const validateCircuitBalance = (): { isValid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic mass balance check only
    const inputFlows = flowLines.filter(fl => !fl.fromEquipment);
    const outputFlows = flowLines.filter(fl => !fl.toEquipment);
    
    const totalInput = inputFlows.reduce((sum, fl) => sum + fl.flowRate, 0);
    const totalOutput = outputFlows.reduce((sum, fl) => sum + fl.flowRate, 0);
    
    if (Math.abs(totalInput - totalOutput) > 1) { // Relaxed criteria to avoid false positives
      errors.push(`Desequilíbrio de massa: Entrada ${totalInput.toFixed(2)} t/h ≠ Saída ${totalOutput.toFixed(2)} t/h`);
    }
    
    // Check for disconnected streams
    const disconnectedStreams = flowLines.filter(fl => !fl.fromEquipment || !fl.toEquipment);
    if (disconnectedStreams.length > 0) {
      warnings.push(`${disconnectedStreams.length} correntes desconectadas`);
    }
    
    // Check equipment connectivity
    for (const equipment of equipments) {
      const inputLines = flowLines.filter(fl => fl.toEquipment === equipment.id);
      const outputLines = flowLines.filter(fl => fl.fromEquipment === equipment.id);
      
      if (inputLines.length === 0 && equipment.type !== 'mixer') {
        warnings.push(`${equipment.name}: Sem entrada definida`);
      }
      
      if (outputLines.length === 0) {
        warnings.push(`${equipment.name}: Sem saída definida`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  // AUTOMATIC ERROR CORRECTION
  const correctCircuitErrors = (analysis: BalanceResult): { corrected: boolean; corrections: string[] } => {
    const corrections: string[] = [];
    let corrected = false;
    
    // Auto-correct flow rates when mass balance is off
    if (analysis.globalError > 0.1) {
      const inputFlows = flowLines.filter(fl => !fl.fromEquipment);
      const outputFlows = flowLines.filter(fl => !fl.toEquipment);
      
      const totalInput = inputFlows.reduce((sum, fl) => sum + fl.flowRate, 0);
      const totalOutput = outputFlows.reduce((sum, fl) => sum + fl.flowRate, 0);
      
      if (totalInput > 0 && totalOutput > 0 && Math.abs(totalInput - totalOutput) > 0.1) {
        // Adjust output flows proportionally to match input
        const correctionFactor = totalInput / totalOutput;
        
        setFlowLines(prev => prev.map(fl => {
          if (!fl.toEquipment) {
            // This is an output stream
            return {
              ...fl,
              flowRate: fl.flowRate * correctionFactor,
              solidPercent: fl.solidPercent // Keep solid percentage constant
            };
          }
          return fl;
        }));
        
        corrections.push(`Corrente de saída ajustada para ${totalInput.toFixed(1)} t/h (fator: ${correctionFactor.toFixed(3)})`);
        corrected = true;
      }
    }
    
    // Auto-correct component grades when severely imbalanced
    for (const [component, error] of Object.entries(analysis.componentErrors)) {
      if (error > 1.0) { // Only correct severe errors > 1%
        const comp = mineralComponents.find(c => c.id === component);
        if (comp && comp.defaultGrade > 0) {
          // Reset grades to default values for this component
          setFlowLines(prev => prev.map(fl => ({
            ...fl,
            componentGrades: {
              ...fl.componentGrades,
              [component]: comp.defaultGrade
            }
          })));
          
          corrections.push(`Teor de ${comp.symbol} resetado para valor padrão ${comp.defaultGrade}%`);
          corrected = true;
        }
      }
    }
    
    // Fill missing component data
    const activeComponents = mineralComponents.filter(c => c.isActive);
    for (const flowLine of flowLines) {
      let needsUpdate = false;
      const updatedGrades = { ...flowLine.componentGrades };
      const updatedComponents = flowLine.components || [];
      
      for (const comp of activeComponents) {
        if (!updatedComponents.includes(comp.id)) {
          updatedComponents.push(comp.id);
          needsUpdate = true;
        }
        
        if (!updatedGrades[comp.id] || updatedGrades[comp.id] === 0) {
          updatedGrades[comp.id] = comp.defaultGrade;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        setFlowLines(prev => prev.map(fl => 
          fl.id === flowLine.id 
            ? { ...fl, components: updatedComponents, componentGrades: updatedGrades }
            : fl
        ));
        corrections.push(`Componentes preenchidos para ${flowLine.name}`);
        corrected = true;
      }
    }
    
    return { corrected, corrections };
  };

  // Execute rigorous analysis only when requested
  const executeRigorousAnalysis = () => {
    addLog('info', 'rigorous-analysis', 'Executando análise rigorosa completa', 
           'Validando todos os balanços com critério < 0.1%');
    
    const analysis = analyzeCircuitBalance(equipments, flowLines, mineralComponents);
    setRigorousAnalysis(analysis);
    
    // Clear old analysis logs
    setLogs(prev => prev.filter(log => log.category !== 'rigorous-analysis'));
    
    // Add comprehensive analysis to logs
    if (analysis.isValid) {
      addLog('success', 'rigorous-analysis', 'Balanços rigorosos validados', 
             `Erro global: ${analysis.globalError.toFixed(4)}% | Critério: < 0.1%`);
    } else {
      addLog('error', 'rigorous-analysis', 'Desequilíbrios detectados', 
             `${Object.values(analysis.componentErrors).filter(e => e > 0.1).length} componentes fora do critério`);
    }
    
    // Component-by-component analysis
    const activeComponents = mineralComponents.filter(c => c.isActive);
    for (const comp of activeComponents) {
      const error = analysis.componentErrors[comp.id] || 0;
      const recovery = analysis.massRecovery[comp.id] || 0;
      const enrichment = analysis.enrichmentRatio[comp.id] || 0;
      
      const status = error < 0.1 ? 'success' : error < 0.5 ? 'warning' : 'error';
      
      addLog(status, 'rigorous-analysis', `${comp.symbol}: Análise detalhada`, 
             `Erro: ${error.toFixed(4)}% | Rec: ${recovery.toFixed(2)}% | Enriq: ${enrichment.toFixed(2)}x`);
    }
  };

  // Estado para o modal de simulação
  const [simulationConfig, setSimulationConfig] = useState({
    feedRate: 1000,
    oreDensity: 2.8,
    solidPercent: 70,
    simulationTime: 24,
    iterations: 100
  });

  const pages = [
    { id: 'simulation', label: 'Simulação', icon: '⚙️' },
    { id: 'parameters', label: 'Parâmetros', icon: '📊' },
    { id: 'results', label: 'Resultados', icon: '📈' },
    { id: 'economy', label: 'Economia', icon: '💰' },
    { id: 'charts', label: 'Gráficos', icon: '📉' },
    { id: 'optimization', label: 'Otimização', icon: '🎯' },
    { id: 'reports', label: 'Relatórios', icon: '📄' },
    { id: 'help', label: 'Help', icon: '❓' }
  ];

  const tools = [
    { id: 'flowline', label: 'Linha', icon: '➡️', description: 'Corrente de Fluxo - Clique e arraste' },

    { id: 'mixer', label: 'Mixer', icon: '🌀', description: 'Misturador - Múltiplas entradas/saídas' },
    { id: 'moinho', label: 'Moinho', icon: '⚙️', description: 'Moinho de Bolas' },
    { id: 'britador', label: 'Britador', icon: '🔨', description: 'Britador' },
    { id: 'rougher', label: 'Rougher', icon: '🔷', description: 'Flotação Rougher' },
    { id: 'cleaner', label: 'Cleaner', icon: '🔹', description: 'Flotação Cleaner' },
    { id: 'recleaner', label: 'Recleaner', icon: '▪️', description: 'Flotação Recleaner' }
  ];

  // Initialize default components for new flow line
  const getDefaultFlowLineComponents = () => {
    const activeComponents = mineralComponents.filter(c => c.isActive);
    const components = activeComponents.map(c => c.id);
    const componentGrades = activeComponents.reduce((grades, c) => {
      grades[c.id] = c.defaultGrade;
      return grades;
    }, {} as { [key: string]: number });
    
    return { components, componentGrades };
  };

  // Helper function to find nearest equipment for snapping
  const findNearestEquipment = (x: number, y: number, excludeId?: string): { x: number; y: number; equipmentId: string; port?: number; isInput?: boolean } | null => {
    const snapDistance = 50; // Increased snap distance
    let nearest: { x: number; y: number; equipmentId: string; port?: number; isInput?: boolean } | null = null;
    let minDistance = snapDistance;

    for (const equipment of equipments) {
      if (equipment.id === excludeId) continue;
      
      if (equipment.type === 'mixer') {
        // Check input ports
        const numInputs = equipment.parameters.numberOfInputs || 2;
        for (let i = 0; i < numInputs; i++) {
          const portX = equipment.x + 0; // Left side
          const portY = equipment.y + 10 + i * 15;
          const distance = Math.sqrt(Math.pow(x - portX, 2) + Math.pow(y - portY, 2));
          
          if (distance < minDistance) {
            minDistance = distance;
            nearest = {
              x: portX,
              y: portY,
              equipmentId: equipment.id,
              port: i,
              isInput: true
            };
          }
        }
        
        // Check output ports
        const numOutputs = equipment.parameters.numberOfOutputs || 1;
        for (let i = 0; i < numOutputs; i++) {
          const portX = equipment.x + 50; // Right side
          const portY = equipment.y + 20 + i * 15;
          const distance = Math.sqrt(Math.pow(x - portX, 2) + Math.pow(y - portY, 2));
          
          if (distance < minDistance) {
            minDistance = distance;
            nearest = {
              x: portX,
              y: portY,
              equipmentId: equipment.id,
              port: i,
              isInput: false
            };
          }
        }
      } else {
        // Standard equipment (single connection point)
        const centerX = equipment.x + 25;
        const centerY = equipment.y + 25;
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        if (distance < minDistance) {
          minDistance = distance;
          nearest = {
            x: centerX,
            y: centerY,
            equipmentId: equipment.id
          };
        }
      }
    }
    
    return nearest;
  };

  // Handler para iniciar desenho de linha
  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool !== 'flowline') return;
    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;
    let fromEquipment: string | undefined;

    // Check for snap to equipment
    const snapPoint = findNearestEquipment(x, y);
    if (snapPoint) {
      x = snapPoint.x;
      y = snapPoint.y;
      fromEquipment = snapPoint.equipmentId;
    }

    const newLine: FlowLine = {
      id: `FL${nextFlowLineId}`,
      name: `Corrente-${nextFlowLineId}`,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      angle: 0,
      length: 0,
      flowRate: 0,
      solidPercent: 0,
      density: 0,
      isDrawing: true,
      fromEquipment,
      fromPort: snapPoint?.port,
      isFromInput: snapPoint?.isInput,
      style: 'solid',
      color: '#333',
      particleSize: 0,
      pressure: 0,
      temperature: 0,
      components: [],
      componentGrades: {}
    };

    setDrawingLine(newLine);
    setIsDrawingMode(true);
  };

  // Handlers para adicionar equipamentos
  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTool || selectedTool === 'flowline' || selectedTool === 'connect') return;
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    if (draggingEquipment) return; // Don't add equipment while dragging

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const newEquipment: Equipment = {
      id: `EQ${nextEquipmentId}`,
      type: selectedTool as Equipment['type'],
      name: `${selectedTool.charAt(0).toUpperCase() + selectedTool.slice(1)}-${nextEquipmentId}`,
      x: x - 25,
      y: y - 25,
      parameters: getDefaultParameters(selectedTool as Equipment['type']),
      inputs: [],
      outputs: []
    };

    setEquipments(prev => [...prev, newEquipment]);
    setNextEquipmentId(prev => prev + 1);
    
    // Log the action
    addLog('success', 'equipment', `Equipamento ${newEquipment.name} adicionado`, 
           `Tipo: ${newEquipment.type}, Posição: (${newEquipment.x}, ${newEquipment.y})`, 
           newEquipment.id);
  };

  // Handle equipment dragging
  const handleEquipmentMouseDown = (event: React.MouseEvent, equipmentId: string) => {
    if (selectedTool === 'flowline' || selectedTool === 'connect') return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const equipment = equipments.find(eq => eq.id === equipmentId);
    if (!equipment) return;
    
    const offsetX = event.clientX - rect.left - equipment.x;
    const offsetY = event.clientY - rect.top - equipment.y;
    
    setDraggingEquipment(equipmentId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    // Handle line drawing
    if (isDrawingMode && drawingLine && selectedTool === 'flowline') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      let x = event.clientX - rect.left;
      let y = event.clientY - rect.top;
      let toEquipment: string | undefined;

      // Check for snap to equipment (exclude the starting equipment)
      const snapPoint = findNearestEquipment(x, y, drawingLine.fromEquipment);
      if (snapPoint) {
        x = snapPoint.x;
        y = snapPoint.y;
        toEquipment = snapPoint.equipmentId;
      }

      const dx = x - drawingLine.startX;
      const dy = y - drawingLine.startY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const length = Math.sqrt(dx * dx + dy * dy);

      setDrawingLine({
        ...drawingLine,
        endX: x,
        endY: y,
        angle,
        length,
        toEquipment,
        toPort: snapPoint?.port,
        isToInput: snapPoint?.isInput
      });
    }
    
    // Handle equipment dragging
    if (draggingEquipment) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const newX = event.clientX - rect.left - dragOffset.x;
      const newY = event.clientY - rect.top - dragOffset.y;
      
      // Update equipment position
      setEquipments(prev => prev.map(eq => 
        eq.id === draggingEquipment ? { ...eq, x: Math.max(0, newX), y: Math.max(0, newY) } : eq
      ));
      
      // Update connected flow lines
      updateConnectedFlowLines(draggingEquipment, newX + 25, newY + 25);
    }
  };

  // Update flow lines when equipment is moved
  const updateConnectedFlowLines = (equipmentId: string, centerX: number, centerY: number) => {
    const equipment = equipments.find(eq => eq.id === equipmentId);
    if (!equipment) return;

    setFlowLines(prev => prev.map(line => {
      let updated = { ...line };
      
      if (line.fromEquipment === equipmentId) {
        if (equipment.type === 'mixer') {
          const port = line.fromPort || 0;
          updated.startX = centerX + 25; // Right side
          updated.startY = centerY - 5 + port * 15;
        } else {
          updated.startX = centerX;
          updated.startY = centerY;
        }
        
        // Recalculate angle and length
        const dx = updated.endX - updated.startX;
        const dy = updated.endY - updated.startY;
        updated.angle = Math.atan2(dy, dx) * (180 / Math.PI);
        updated.length = Math.sqrt(dx * dx + dy * dy);
      }
      
      if (line.toEquipment === equipmentId) {
        if (equipment.type === 'mixer') {
          const port = line.toPort || 0;
          updated.endX = centerX - 25; // Left side
          updated.endY = centerY - 15 + port * 15;
        } else {
          updated.endX = centerX;
          updated.endY = centerY;
        }
        
        // Recalculate angle and length
        const dx = updated.endX - updated.startX;
        const dy = updated.endY - updated.startY;
        updated.angle = Math.atan2(dy, dx) * (180 / Math.PI);
        updated.length = Math.sqrt(dx * dx + dy * dy);
      }
      
      return updated;
    }));
  };

  const handleCanvasMouseUp = () => {
    if (isDrawingMode && drawingLine) {
      const finalLine = { ...drawingLine, isDrawing: false };
      setFlowLines(prev => [...prev, finalLine]);
      setDrawingLine(null);
      setIsDrawingMode(false);
      setNextFlowLineId(prev => prev + 1);
    }
    
    if (draggingEquipment) {
      setDraggingEquipment(null);
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // Menu de contexto
  const showContextMenu = (event: React.MouseEvent, equipmentId?: string, flowLineId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Close any existing context menu first
    setContextMenu(null);
    
    // Open new context menu after a brief delay to ensure proper state update
    setTimeout(() => {
      setContextMenu({ 
        x: event.clientX, 
        y: event.clientY, 
        equipmentId,
        flowLineId
      });
    }, 10);
  };

  const hideContextMenu = () => setContextMenu(null);

  // Function to get all unique chemical elements from active minerals
  const getAllChemicalElements = () => {
    const elements = new Set<string>();
    mineralComponents
      .filter(c => c.isActive)
      .forEach(mineral => {
        if (mineral.chemicalElements) {
          Object.keys(mineral.chemicalElements).forEach(element => {
            elements.add(element);
          });
        }
      });
    return Array.from(elements).sort();
  };

  // COMPREHENSIVE PRE-SIMULATION VALIDATION
  const validatePreSimulation = () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    addLog('info', 'validation', 'Iniciando validação pré-simulação', 'Verificando requisitos obrigatórios');
    
    // 1. Check if equipments exist
    if (equipments.length === 0) {
      errors.push('❌ Nenhum equipamento adicionado ao fluxograma');
      addLog('error', 'validation', 'ETAPA OBRIGATÓRIA: Equipamentos', 'Adicione pelo menos um equipamento ao fluxograma');
    } else {
      addLog('success', 'validation', '✅ Equipamentos presentes', `${equipments.length} equipamentos encontrados`);
    }
    
    // 2. Check if flow lines exist
    if (flowLines.length === 0) {
      errors.push('❌ Nenhuma corrente criada no fluxograma');
      addLog('error', 'validation', 'ETAPA OBRIGATÓRIA: Correntes', 'Adicione pelo menos uma corrente ao fluxograma');
    } else {
      addLog('success', 'validation', '✅ Correntes presentes', `${flowLines.length} correntes encontradas`);
    }
    
    // 3. Check if components are selected
    const activeComponents = mineralComponents.filter(c => c.isActive);
    if (activeComponents.length === 0) {
      errors.push('❌ Nenhum componente selecionado');
      addLog('error', 'validation', 'ETAPA OBRIGATÓRIA: Componentes', 'Vá para página "Componentes" → Selecione minerais → Clique em ativar');
    } else {
      addLog('success', 'validation', '✅ Componentes selecionados', `${activeComponents.length} componentes ativos: ${activeComponents.map(c => c.symbol).join(', ')}`);
    }
    
    // 4. Check if flow lines have data
    let flowLinesWithData = 0;
    let flowLinesWithoutData = 0;
    
    flowLines.forEach((line, index) => {
      const hasBasicData = line.flowRate > 0 && line.solidPercent > 0 && line.density > 0;
      const hasComponents = line.components && line.components.length > 0;
      
      if (hasBasicData) {
        flowLinesWithData++;
      } else {
        flowLinesWithoutData++;
        addLog('warning', 'validation', `Corrente "${line.name}" sem dados`, 'Clique direito na corrente → "Editar parâmetros" → Configure vazão, % sólidos e densidade');
      }
      
      if (!hasComponents || line.components.length === 0) {
        addLog('warning', 'validation', `Corrente "${line.name}" sem componentes`, 'Clique direito na corrente → "Editar parâmetros" → Adicione componentes');
      }
    });
    
    if (flowLinesWithoutData > 0) {
      warnings.push(`⚠️ ${flowLinesWithoutData} correntes sem dados básicos`);
      addLog('warning', 'validation', 'ETAPA RECOMENDADA: Dados das Correntes', `${flowLinesWithoutData} correntes precisam de vazão, % sólidos e densidade`);
    }
    
    if (flowLinesWithData > 0) {
      addLog('success', 'validation', '✅ Correntes com dados', `${flowLinesWithData} correntes têm dados básicos configurados`);
    }
    
    // 5. Check circuit connectivity
    const disconnectedEquipments = equipments.filter(eq => {
      const hasInput = flowLines.some(fl => fl.toEquipment === eq.id);
      const hasOutput = flowLines.some(fl => fl.fromEquipment === eq.id);
      return !hasInput || !hasOutput;
    });
    
    if (disconnectedEquipments.length > 0) {
      warnings.push(`⚠️ ${disconnectedEquipments.length} equipamentos desconectados`);
      disconnectedEquipments.forEach(eq => {
        addLog('warning', 'validation', `Equipamento "${eq.name}" desconectado`, 'Conecte correntes de entrada e saída');
      });
    }
    
    // 6. Check simulation configuration
    if (simulationConfig.feedRate <= 0) {
      warnings.push('⚠️ Taxa de alimentação não configurada');
      addLog('warning', 'validation', 'ETAPA RECOMENDADA: Configuração', 'Configure taxa de alimentação na página "Parâmetros"');
    }
    
    // Final validation summary
    if (errors.length === 0) {
      addLog('success', 'validation', '🎉 Validação pré-simulação APROVADA', 'Todos os requisitos obrigatórios atendidos');
    } else {
      addLog('error', 'validation', '🚫 Validação pré-simulação REPROVADA', `${errors.length} erros críticos encontrados`);
    }
    
    if (warnings.length > 0) {
      addLog('warning', 'validation', `⚠️ ${warnings.length} avisos encontrados`, 'Simulação pode executar mas resultados podem ser limitados');
    }
    
    return { errors, warnings };
  };

  // ENHANCED SIMULATION WITH RIGOROUS ANALYSIS
  const executeSimulation = () => {
    // STEP 1: Comprehensive pre-simulation validation
    const preValidation = validatePreSimulation();
    
    // Block simulation if critical errors exist
    if (preValidation.errors.length > 0) {
      addLog('error', 'simulation', 'Simulação BLOQUEADA', 'Corrija os erros obrigatórios listados nos logs antes de executar');
      addLog('info', 'validation', '📋 CHECKLIST de Etapas Obrigatórias:', '1️⃣ Adicione equipamentos ao fluxograma | 2️⃣ Desenhe correntes conectando equipamentos | 3️⃣ Vá em "Componentes" e ative minerais | 4️⃣ Configure dados das correntes (clique direito)');
      alert('❌ Simulação bloqueada!\n\nVerifique os logs para ver as etapas obrigatórias que estão faltando.');
      return;
    }
    
    // Show warnings but allow simulation
    if (preValidation.warnings.length > 0) {
      addLog('warning', 'simulation', 'Simulação com restrições', `${preValidation.warnings.length} avisos encontrados - resultados podem ser limitados`);
    }

    // Pre-simulation rigorous validation
    const validation = validateCircuitBalance();
    
    addLog('info', 'simulation', 'Iniciando análise rigorosa do circuito', 
           `${equipments.length} equipamentos, ${flowLines.length} correntes`);
    
    // Critical errors prevent simulation
    if (validation.errors.length > 0) {
      const criticalErrors = validation.errors.filter(e => e.includes('ERRO CRÍTICO'));
      if (criticalErrors.length > 0) {
        criticalErrors.forEach(error => {
          addLog('error', 'simulation', 'Erro crítico impede simulação', error);
        });
        
        // Apply auto-correction if available (currently disabled for simplified validation)
        addLog('warning', 'simulation', 'Correção automática não disponível', 
               'Execute simulação para aplicar balanços iterativos');
        
        alert('Erros críticos no balanço impedem a simulação. Verifique os logs.');
        return;
      }
    }
    
    setIsSimulating(true);
    addLog('success', 'simulation', 'Iniciando simulação iterativa', 
           `Balanço automático de massa até convergência < 0.001%`);
    
    // Log enabled modules status
    const enabledModules: string[] = [];
    if (economyEnabled) enabledModules.push('💰 Economia');
    if (chartsEnabled) enabledModules.push('📊 Gráficos');
    if (optimizationEnabled) enabledModules.push('⚙️ Otimização');
    
    if (enabledModules.length > 0) {
      addLog('info', 'simulation', 'Módulos avançados habilitados', enabledModules.join(' • '));
    } else {
      addLog('info', 'simulation', 'Simulação básica', 'Apenas balanço de massa (módulos avançados desabilitados)');
    }
    
    // PHASE 1: Enhanced iterative process simulation
    const results = runSimulation(equipments, flowLines, simulationConfig, mineralComponents);
    setSimulationResults(results);
    
    // Extract iterative results
    const iterativeResults = (results as any).iterativeResult as IterativeResult;
    const detailedStreamResults = (results as any).detailedStreams as DetailedStream[];
    const coherenceReportResults = (results as any).coherenceReport as string[];
    
    if (iterativeResults) {
      setIterativeResult(iterativeResults);
      setDetailedStreams(detailedStreamResults || []);
      setCoherenceReport(coherenceReportResults || []);
      
      // Log iterative process details
      if (iterativeResults.converged) {
        addLog('success', 'simulation', `Convergência alcançada em ${iterativeResults.iterations} iterações`, 
               `Erro máximo: ${iterativeResults.maxError.toFixed(6)}% | Erro global: ${iterativeResults.globalError.toFixed(6)}%`);
      } else {
        addLog('warning', 'simulation', `Convergência parcial em ${iterativeResults.iterations} iterações`, 
               `Erro máximo: ${iterativeResults.maxError.toFixed(6)}% (limite: 0.001%)`);
      }
      
      // Log component errors
      Object.entries(iterativeResults.componentErrors).forEach(([component, error]) => {
        const comp = mineralComponents.find(c => c.id === component);
        const status = error < 0.001 ? 'success' : error < 0.01 ? 'warning' : 'error';
        addLog(status, 'simulation', 
               `${comp?.symbol || component}: Balanço ${error < 0.001 ? 'perfeito' : 'parcial'}`, 
               `Erro: ${error.toFixed(6)}%`);
      });
      
      // Log coherence issues
      iterativeResults.coherenceIssues.forEach(issue => {
        const isError = issue.includes('ERROR');
        addLog(isError ? 'error' : 'warning', 'simulation', 
               `Coerência: ${isError ? 'Problema' : 'Aviso'}`, issue);
      });
    }
    
    // PHASE 2: Economic analysis (only if enabled)
    if (economyEnabled) {
      const economics = calculateEconomics(equipments, results);
      setEconomicResults(economics);
      addLog('success', 'economics', 'Análise econômica calculada', 
             `VPL: $${(economics.npv / 1000000).toFixed(1)}M | TIR: ${economics.irr.toFixed(1)}%`);
    }
    
    // PHASE 3: Update flow lines with calculated values (PERFECT MASS BALANCE)
    const updatedFlowLines = flowLines.map((line) => {
      // Find connected equipment results
      const fromEquipResult = results.find(r => r.equipment === equipments.find(eq => eq.id === line.fromEquipment)?.name);
      
      if (fromEquipResult && fromEquipResult.outputs.length > 0) {
        // Find the correct output stream for this line
        const outputIndex = Math.min(line.fromPort || 0, fromEquipResult.outputs.length - 1);
        const output = fromEquipResult.outputs[outputIndex];
        
        return {
          ...line,
          flowRate: output.flowRate,
          solidPercent: output.solidPercent,
          density: output.density,
          particleSize: output.particleSize || line.particleSize,
          // Update component grades from simulation results
          componentGrades: {
            ...line.componentGrades,
            ...output.components
          }
        };
      }
      
      return line;
    });
    setFlowLines(updatedFlowLines);
    
    // PHASE 4: Post-simulation validation and analysis
    setTimeout(() => {
      const postSimValidation = validateCircuitBalance();
      
      // PHASE 5: Sensitivity Analysis (only if optimization enabled)
      if (optimizationEnabled) {
        addLog('info', 'simulation', 'Executando análise de sensibilidade', 'Testando robustez do modelo');
        
        const sensitivityResults = performSensitivityAnalysis(updatedFlowLines, mineralComponents, 5);
        
        // Log sensitivity results
        const criticalSensitivities = sensitivityResults.filter(s => 
          Math.abs(s.impactOnBalance) > 0.1 || 
          Object.values(s.impactOnRecovery).some(impact => Math.abs(impact) > 2)
        );
        
        if (criticalSensitivities.length > 0) {
          addLog('warning', 'sensitivity', `${criticalSensitivities.length} parâmetros sensíveis detectados`, 
                 'Variações podem afetar significativamente o balanço');
          
          criticalSensitivities.forEach(sens => {
            const maxImpact = Math.max(...Object.values(sens.impactOnRecovery).map(Math.abs));
            addLog('info', 'sensitivity', `${sens.parameter}: sensibilidade alta`, 
                   `Variação de 5% impacta recuperação em até ${maxImpact.toFixed(1)}%`);
          });
        } else {
          addLog('success', 'sensitivity', 'Modelo robusto', 'Baixa sensibilidade a variações dos parâmetros');
        }
      }
      
      // PHASE 6: Final results and validation
      setIsSimulating(false);
      
      const totalPower = results.reduce((sum, r) => sum + r.powerConsumption, 0);
      
      // Use iterative results for final summary
      if (iterativeResults && iterativeResults.converged) {
        addLog('success', 'simulation', 'SIMULAÇÃO ITERATIVA COMPLETA', 
               `Balanço 100% fechado em ${iterativeResults.iterations} iterações | Potência: ${totalPower.toFixed(0)} kW`);
        
        // Component performance summary using iterative results
        const activeComponents = mineralComponents.filter(c => c.isActive);
        let overallPerformance = 'EXCELENTE';
        let validComponents = 0;
        
        for (const comp of activeComponents) {
          const error = iterativeResults.componentErrors[comp.id] || 0;
          
          if (error < 0.001) {
            addLog('success', 'metallurgy', `${comp.symbol}: Balanço perfeito`, 
                   `Erro: ${error.toFixed(6)}% | Critério < 0.001% atendido`);
            validComponents++;
          } else if (error < 0.01) {
            addLog('warning', 'metallurgy', `${comp.symbol}: Balanço aceitável`, 
                   `Erro: ${error.toFixed(6)}% | Próximo do critério`);
          } else {
            addLog('error', 'metallurgy', `${comp.symbol}: Balanço insatisfatório`, 
                   `Erro: ${error.toFixed(6)}% | Acima do critério`);
            overallPerformance = 'CRÍTICA';
          }
        }
        
        // Overall performance rating
        if (validComponents === activeComponents.length) {
          overallPerformance = 'EXCELENTE';
        } else if (validComponents >= activeComponents.length * 0.8) {
          overallPerformance = 'BOA';
        } else if (validComponents >= activeComponents.length * 0.6) {
          overallPerformance = 'REGULAR';
        }
        
        addLog('info', 'performance', `PERFORMANCE GLOBAL: ${overallPerformance}`, 
               `${validComponents}/${activeComponents.length} componentes com balanço perfeito`);
      } else {
        addLog('warning', 'simulation', 'Simulação básica concluída', 
               `Balanços iterativos não executados | Potência: ${totalPower.toFixed(0)} kW`);
      }
      
      // Economic performance (only if enabled)
      if (economyEnabled && economicResults) {
        if (economicResults.npv > 0) {
          addLog('success', 'economics', 'Projeto economicamente viável', 
                 `VPL: $${(economicResults.npv/1000000).toFixed(1)}M, TIR: ${economicResults.irr.toFixed(1)}%`);
        } else {
          addLog('warning', 'economics', 'Viabilidade econômica questionável', 
                 `VPL negativo: $${(economicResults.npv/1000000).toFixed(1)}M`);
        }
      }
      
      setCurrentPage('results');
    }, 2000); // Longer delay for comprehensive analysis
  };

  const deleteEquipment = (equipmentId: string) => {
    const equipment = equipments.find(eq => eq.id === equipmentId);
    
    setEquipments(prev => prev.filter(eq => eq.id !== equipmentId));
    
    // Remove connected flow lines
    const connectedLines = flowLines.filter(fl => fl.fromEquipment === equipmentId || fl.toEquipment === equipmentId);
    setFlowLines(prev => prev.filter(fl => fl.fromEquipment !== equipmentId && fl.toEquipment !== equipmentId));
    
    // Log the action
    addLog('info', 'equipment', `Equipamento ${equipment?.name || equipmentId} removido`, 
           `${connectedLines.length} correntes conectadas também removidas`, equipmentId);
    
    hideContextMenu();
  };

  const deleteFlowLine = (flowLineId: string) => {
    const line = flowLines.find(fl => fl.id === flowLineId);
    
    setFlowLines(prev => prev.filter(fl => fl.id !== flowLineId));
    
    // Log the action
    addLog('info', 'flow', `Corrente ${line?.name || flowLineId} removida`, 
           `Vazão: ${line?.flowRate || 0} t/h, Componentes: ${line?.components?.length || 0}`, 
           undefined, flowLineId);
    
    hideContextMenu();
  };

  const editEquipment = (equipmentId: string) => {
    const equipment = equipments.find(eq => eq.id === equipmentId);
    if (equipment) {
      setEditingEquipment(equipment);
      setShowEditModal(true);
    }
    hideContextMenu();
  };

  const editFlowLine = (flowLineId: string) => {
    const flowLine = flowLines.find(fl => fl.id === flowLineId);
    if (flowLine) {
      setEditingFlowLine(flowLine);
      setShowFlowEditModal(true);
    }
    hideContextMenu();
  };

  const saveEquipment = (updatedEquipment: Equipment) => {
    const oldEquipment = equipments.find(eq => eq.id === updatedEquipment.id);
    
    setEquipments(prev => prev.map(eq => 
      eq.id === updatedEquipment.id ? updatedEquipment : eq
    ));
    
    // Log the changes
    const changes: string[] = [];
    if (oldEquipment) {
      if (oldEquipment.name !== updatedEquipment.name) changes.push(`Nome: ${oldEquipment.name} → ${updatedEquipment.name}`);
      if (JSON.stringify(oldEquipment.parameters) !== JSON.stringify(updatedEquipment.parameters)) {
        changes.push('Parâmetros operacionais modificados');
      }
    }
    
    addLog('success', 'equipment', `Equipamento ${updatedEquipment.name} editado`, 
           changes.length > 0 ? changes.join(', ') : 'Parâmetros atualizados', 
           updatedEquipment.id, undefined, 
           () => {
             const eq = equipments.find(e => e.id === updatedEquipment.id);
             if (eq) {
               setEditingEquipment(eq);
               setShowEditModal(true);
             }
           });
    
    setShowEditModal(false);
    setEditingEquipment(null);
  };

  const saveFlowLine = (updatedFlowLine: FlowLine) => {
    const oldFlowLine = flowLines.find(fl => fl.id === updatedFlowLine.id);
    
    setFlowLines(prev => prev.map(fl => 
      fl.id === updatedFlowLine.id ? updatedFlowLine : fl
    ));
    
    // Log the changes
    const changes: string[] = [];
    if (oldFlowLine) {
      if (oldFlowLine.name !== updatedFlowLine.name) changes.push(`Nome: ${oldFlowLine.name} → ${updatedFlowLine.name}`);
      if (oldFlowLine.flowRate !== updatedFlowLine.flowRate) changes.push(`Vazão: ${oldFlowLine.flowRate} → ${updatedFlowLine.flowRate} t/h`);
      if (oldFlowLine.solidPercent !== updatedFlowLine.solidPercent) changes.push(`% Sólidos: ${oldFlowLine.solidPercent} → ${updatedFlowLine.solidPercent}%`);
      if (JSON.stringify(oldFlowLine.componentGrades) !== JSON.stringify(updatedFlowLine.componentGrades)) {
        changes.push('Composição metalúrgica alterada');
      }
    }
    
    addLog('success', 'flow', `Corrente ${updatedFlowLine.name} editada`, 
           changes.length > 0 ? changes.join(', ') : 'Propriedades atualizadas', 
           undefined, updatedFlowLine.id,
           () => {
             const fl = flowLines.find(f => f.id === updatedFlowLine.id);
             if (fl) {
               setEditingFlowLine(fl);
               setShowFlowEditModal(true);
             }
           });
    
    setShowFlowEditModal(false);
    setEditingFlowLine(null);
  };

  // Connect flow line to equipment
  const connectLineToEquipment = (lineId: string, equipmentId: string, isStart: boolean, port?: number) => {
    const equipment = equipments.find(eq => eq.id === equipmentId);
    if (!equipment) return;

    let x, y;
    
    if (equipment.type === 'mixer') {
      if (isStart) {
        // Connect to output port
        const outputPort = port || 0;
        x = equipment.x + 50;
        y = equipment.y + 20 + outputPort * 15;
      } else {
        // Connect to input port
        const inputPort = port || 0;
        x = equipment.x;
        y = equipment.y + 10 + inputPort * 15;
      }
    } else {
      // Standard equipment
      x = equipment.x + 25;
      y = equipment.y + 25;
    }

    setFlowLines(prev => prev.map(line => {
      if (line.id === lineId) {
        if (isStart) {
          return {
            ...line,
            startX: x,
            startY: y,
            fromEquipment: equipmentId,
            fromPort: port
          };
        } else {
          return {
            ...line,
            endX: x,
            endY: y,
            toEquipment: equipmentId,
            toPort: port
          };
        }
      }
      return line;
    }));
    
    // Log the connection
    const line = flowLines.find(fl => fl.id === lineId);
    const connectionType = isStart ? 'origem' : 'destino';
    const portInfo = port !== undefined ? ` (porta ${port + 1})` : '';
    
    addLog('success', 'connection', 
           `Corrente ${line?.name || lineId} conectada`, 
           `${connectionType}: ${equipment.name}${portInfo}`, 
           equipmentId, lineId);
  };

  // Parâmetros padrão por tipo de equipamento
  const getDefaultParameters = (type: Equipment['type']): EquipmentParameters => {
    const defaultComponents = {
      'Fe': { feedGrade: 35, concentrate: 65, tailing: 8, recovery: 85 },
      'SiO2': { feedGrade: 45, concentrate: 8, tailing: 65, recovery: 15 },
      'Al2O3': { feedGrade: 12, concentrate: 2, tailing: 18, recovery: 10 },
      'P': { feedGrade: 0.8, concentrate: 0.4, tailing: 1.0, recovery: 30 }
    };

    switch (type) {
      case 'moinho':
        return { 
          power: 1000, 
          diameter: 4.5, 
          length: 6.0, 
          ballLoad: 35, 
          speed: 75,
          components: defaultComponents
        };
      case 'britador':
        return { 
          power: 500, 
          reduction: 5, 
          feedSize: 500, 
          productSize: 100, 
          capacity: 100,
          components: defaultComponents
        };
      case 'mixer':
        return { 
          numberOfInputs: 2, 
          numberOfOutputs: 1, 
          mixingTime: 5, 
          efficiency: 98, 
          power: 50,
          components: defaultComponents
        };
      case 'rougher':
      case 'cleaner':
      case 'recleaner':
        return { 
          cellVolume: 100, 
          numberOfCells: 4, 
          airFlow: 100, 
          reagentDosage: 50, 
          recovery: 85, 
          grade: 20,
          components: defaultComponents
        };
      default:
        return { components: defaultComponents };
    }
  };

  // Renderizar equipamento
  const renderEquipment = (equipment: Equipment) => {
    const equipmentStyles = {
      moinho: { color: '#4a90b8', symbol: '●', size: '32px' },
      britador: { color: '#dc2626', symbol: '▲', size: '28px' },
      mixer: { color: '#f39c12', symbol: '🌀', size: '30px' },
      rougher: { color: '#059669', symbol: '■', size: '30px' },
      cleaner: { color: '#2563eb', symbol: '■', size: '26px' },
      recleaner: { color: '#7c3aed', symbol: '■', size: '22px' }
    };
    
    const style = equipmentStyles[equipment.type];
    const isSnapTarget = selectedTool === 'flowline' && isDrawingMode;
    
    return (
      <div
        key={equipment.id}
        onContextMenu={(e) => showContextMenu(e, equipment.id)}
        onMouseDown={(e) => handleEquipmentMouseDown(e, equipment.id)}
        style={{
          position: 'absolute',
          left: equipment.x,
          top: equipment.y,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: draggingEquipment === equipment.id ? 'grabbing' : 
                  (selectedTool === 'flowline' || selectedTool === 'connect') ? 'crosshair' : 'grab',
          userSelect: 'none',
          zIndex: isSnapTarget ? 10 : (draggingEquipment === equipment.id ? 20 : 1)
        }}
        title={`${equipment.name} - Arraste para mover | Clique direito para opções`}
      >
        {/* Snap zone indicator */}
        {isSnapTarget && (
          <div style={{
            position: 'absolute',
            top: '-15px',
            left: '-15px',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '2px dashed #3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            animation: 'pulse 2s infinite',
            pointerEvents: 'none'
          }} />
        )}
        
        {/* Mixer connection points */}
        {equipment.type === 'mixer' && (
          <>
            {/* Input ports */}
            {Array.from({ length: equipment.parameters.numberOfInputs || 2 }, (_, i) => (
              <div
                key={`input-${i}`}
                style={{
                  position: 'absolute',
                  left: '-8px',
                  top: `${5 + i * 15}px`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#3498db',
                  borderRadius: '50%',
                  border: '1px solid white',
                  fontSize: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white'
                }}
                title={`Entrada ${i + 1}`}
              >
                {i + 1}
              </div>
            ))}
            
            {/* Output ports */}
            {Array.from({ length: equipment.parameters.numberOfOutputs || 1 }, (_, i) => (
              <div
                key={`output-${i}`}
                style={{
                  position: 'absolute',
                  right: '-8px',
                  top: `${15 + i * 15}px`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#27ae60',
                  borderRadius: '50%',
                  border: '1px solid white',
                  fontSize: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white'
                }}
                title={`Saída ${i + 1}`}
              >
                {i + 1}
              </div>
            ))}
          </>
        )}
        
        <div style={{
          color: style.color,
          fontSize: style.size,
          lineHeight: '1',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          position: 'relative',
          zIndex: 2
        }}>
          {style.symbol}
        </div>
        <span style={{
          fontSize: '10px',
          marginTop: '2px',
          backgroundColor: 'white',
          padding: '1px 4px',
          borderRadius: '2px',
          border: '1px solid #ccc',
          whiteSpace: 'nowrap',
          position: 'relative',
          zIndex: 2
        }}>
          {equipment.name}
        </span>
      </div>
    );
  };

  // Renderizar linha de fluxo
  const renderFlowLine = (line: FlowLine, isHovered: boolean = false) => {
    const markerSize = 8;
    const markerId = `arrow-${line.id}`;
    const strokeColor = line.color || '#333';
    const strokeWidth = line.style === 'recycle' ? 3 : 2;
    
    // Define stroke dash array based on style
    let strokeDasharray: string | undefined = undefined;
    if (line.style === 'dashed') {
      strokeDasharray = '5, 5';
    } else if (line.style === 'recycle') {
      strokeDasharray = '10, 5';
    }
    
    // If connected to equipment, show connection indicators
    const showConnectionDots = line.fromEquipment || line.toEquipment;
    
    return (
      <g key={line.id}>
        <defs>
          <marker
            id={markerId}
            markerWidth={markerSize}
            markerHeight={markerSize}
            refX={markerSize}
            refY={markerSize/2}
            orient="auto"
          >
            <path
              d={`M 0 0 L ${markerSize} ${markerSize/2} L 0 ${markerSize} z`}
              fill={strokeColor}
            />
          </marker>
        </defs>
        
        {/* Invisible wider line for easier clicking */}
        {!line.isDrawing && (
          <line
            x1={line.startX}
            y1={line.startY}
            x2={line.endX}
            y2={line.endY}
            stroke="transparent"
            strokeWidth="20"
            style={{ cursor: selectedTool === 'connect' ? 'crosshair' : 'pointer' }}
            onMouseEnter={() => setHoveredLineId(line.id)}
            onMouseLeave={() => setHoveredLineId(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showContextMenu(e, undefined, line.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (selectedTool === 'connect') {
                editFlowLine(line.id);
              }
            }}
          />
        )}
        
        <line
          x1={line.startX}
          y1={line.startY}
          x2={line.endX}
          y2={line.endY}
          stroke={line.isDrawing ? '#888' : (isHovered ? '#0066cc' : strokeColor)}
          strokeWidth={isHovered ? strokeWidth + 1 : strokeWidth}
          strokeDasharray={strokeDasharray}
          markerEnd={`url(#${markerId})`}
          style={{ pointerEvents: 'none', transition: 'stroke 0.2s, stroke-width 0.2s' }}
        />
        
        {/* Connection indicators */}
        {!line.isDrawing && (
          <>
            {line.fromEquipment ? (
              <circle cx={line.startX} cy={line.startY} r="5" fill="#4a90b8" stroke="white" strokeWidth="2" />
            ) : (
              <circle cx={line.startX} cy={line.startY} r="4" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeDasharray="2,2">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            {line.toEquipment ? (
              <circle cx={line.endX} cy={line.endY} r="5" fill="#059669" stroke="white" strokeWidth="2" />
            ) : (
              <circle cx={line.endX} cy={line.endY} r="4" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeDasharray="2,2">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </>
        )}
        
        {/* Snap indicator during drawing */}
        {line.isDrawing && (
          <>
            {line.fromEquipment && (
              <circle cx={line.startX} cy={line.startY} r="6" fill="none" stroke="#4a90b8" strokeWidth="2" strokeDasharray="2,2">
                <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
              </circle>
            )}
            {line.toEquipment && (
              <circle cx={line.endX} cy={line.endY} r="6" fill="none" stroke="#059669" strokeWidth="2" strokeDasharray="2,2">
                <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
              </circle>
            )}
          </>
        )}
        
        {!line.isDrawing && (
          <>
            <text
              x={(line.startX + line.endX) / 2}
              y={(line.startY + line.endY) / 2 - 5}
              fontSize="10"
              fill="#333"
              textAnchor="middle"
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {line.name}
            </text>
          </>
        )}
      </g>
    );
  };

  // Auto-update flow line data when equipment connections change
  useEffect(() => {
    // Update flow lines when equipments are moved or modified
    setFlowLines(prev => prev.map(line => {
      let updated = { ...line };
      
      // Recalculate component composition for connected mixers
      if (line.toEquipment) {
        const toEquipment = equipments.find(eq => eq.id === line.toEquipment);
        if (toEquipment?.type === 'mixer') {
          // Get all input lines to this mixer
          const inputLines = flowLines.filter(fl => fl.toEquipment === line.toEquipment);
          
          if (inputLines.length > 1) {
            // Calculate weighted average of components
            const totalFlow = inputLines.reduce((sum, fl) => sum + fl.flowRate, 0);
            const newComponentGrades: { [key: string]: number } = {};
            
            // Get all unique components from input streams
            const allComponents = Array.from(new Set(inputLines.flatMap(fl => fl.components || [])));
            
            for (const compId of allComponents) {
              const weightedSum = inputLines.reduce((sum, fl) => {
                const grade = fl.componentGrades?.[compId] || 0;
                return sum + (fl.flowRate * grade / 100);
              }, 0);
              newComponentGrades[compId] = totalFlow > 0 ? (weightedSum / totalFlow) * 100 : 0;
            }
            
            updated.componentGrades = newComponentGrades;
            updated.components = allComponents;
          }
        }
      }
      
      return updated;
    }));
  }, [equipments, flowLines.length]); // React to equipment changes

  // Usar useEffect para adicionar listeners globais
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [contextMenu]);

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f0f2f5', fontFamily: 'Arial, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '180px', backgroundColor: '#2c3e50', padding: '10px', boxShadow: '2px 0 5px rgba(0,0,0,0.1)' }}>
        <h2 style={{ color: 'white', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>ASPEN Simulator</h2>
        {pages.map(page => (
          <button
            key={page.id}
            onClick={() => setCurrentPage(page.id)}
            style={{
              width: '100%',
              padding: '12px 10px',
              marginBottom: '5px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: currentPage === page.id ? '#3498db' : 'transparent',
              color: 'white',
              fontSize: '12px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'background-color 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              if (currentPage !== page.id) {
                e.currentTarget.style.backgroundColor = '#34495e';
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage !== page.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span>{page.icon}</span>
            <span>{page.label}</span>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{ 
          height: '50px', 
          backgroundColor: 'white', 
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '10px'
        }}>
          <button 
            onClick={executeSimulation}
            disabled={isSimulating}
            style={{
              padding: '6px 12px',
              backgroundColor: isSimulating ? '#95a5a6' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: isSimulating ? 'not-allowed' : 'pointer'
            }}
          >
            {isSimulating ? '⏳ Simulando...' : '▶️ Executar'}
          </button>
          
          <button style={{
            padding: '6px 12px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
          }}>⏸️ Pausar</button>
          
          <button style={{
            padding: '6px 12px',
            backgroundColor: '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
          }}>🔄 Resetar</button>
          
          <button 
            onClick={() => {
              if (!optimizationEnabled) {
                alert('Habilite a Otimização na página Otimização antes de executar análise de sensibilidade!');
                return;
              }
              
              if (flowLines.length === 0) {
                alert('Adicione correntes ao fluxograma antes de executar análise de sensibilidade!');
                return;
              }
              
              addLog('info', 'sensitivity', 'Iniciando análise de sensibilidade detalhada', 
                     'Testando impacto de variações em todos os parâmetros');
              
              // Execute detailed sensitivity analysis
              const sensitivityResults = performSensitivityAnalysis(flowLines, mineralComponents, 10);
              
              // Log detailed results
              sensitivityResults.forEach(result => {
                const maxRecoveryImpact = Math.max(...Object.values(result.impactOnRecovery).map(Math.abs));
                const balanceImpact = Math.abs(result.impactOnBalance);
                
                const severity = maxRecoveryImpact > 5 || balanceImpact > 0.2 ? 'warning' : 
                                 maxRecoveryImpact > 2 || balanceImpact > 0.1 ? 'info' : 'success';
                
                addLog(severity, 'sensitivity', 
                       `${result.parameter}: Sensibilidade ${severity === 'warning' ? 'ALTA' : severity === 'info' ? 'MÉDIA' : 'BAIXA'}`, 
                       `Variação 10%: Rec.±${maxRecoveryImpact.toFixed(1)}%, Bal.±${balanceImpact.toFixed(3)}%`);
              });
              
              // Overall sensitivity assessment
              const highSensitivity = sensitivityResults.filter(r => 
                Math.max(...Object.values(r.impactOnRecovery).map(Math.abs)) > 5 ||
                Math.abs(r.impactOnBalance) > 0.2
              );
              
              if (highSensitivity.length > 0) {
                addLog('warning', 'sensitivity', `${highSensitivity.length} parâmetros críticos identificados`, 
                       'Requerem controle operacional rigoroso');
              } else {
                addLog('success', 'sensitivity', 'Sistema robusto confirmado', 
                       'Baixa sensibilidade a variações operacionais');
              }
            }}
            disabled={isSimulating}
            style={{
              padding: '6px 12px',
              backgroundColor: isSimulating ? '#bdc3c7' : '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: isSimulating ? 'not-allowed' : 'pointer'
            }}
          >
            📊 Análise Sensibilidade
          </button>
          
          <button 
            onClick={() => setShowComponentsModal(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#8e44ad',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🧪 Componentes
          </button>
          
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>
            Status: <span style={{ color: '#27ae60', fontWeight: 'bold' }}>Pronto</span>
          </div>
        </div>

        {/* Workspace */}
        <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
          {currentPage === 'simulation' && (
            <div style={{ display: 'flex', gap: '20px', height: '100%', position: 'relative' }}>
              {/* Tool Palette */}
              <div style={{
                width: '90px',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxHeight: 'fit-content'
              }}>
                <h3 style={{ fontSize: '11px', marginBottom: '10px', textAlign: 'center', color: '#666' }}>Ferramentas</h3>
                {tools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setSelectedTool(tool.id === selectedTool ? null : tool.id)}
                    style={{
                      padding: '8px',
                      border: selectedTool === tool.id ? '2px solid #3498db' : '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: selectedTool === tool.id ? '#ecf0f1' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    title={tool.description}
                  >
                    <span style={{ fontSize: '20px' }}>{tool.icon}</span>
                    <span style={{ fontSize: '9px', color: '#666' }}>{tool.label}</span>
                  </button>
                ))}
              </div>

              {/* Canvas Area */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '10px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Área de Trabalho - Simulação
                    {selectedTool === 'flowline' && (
                      <span style={{ marginLeft: '10px', color: '#3498db', fontStyle: 'italic' }}>
                        (Clique e arraste para desenhar linha - aproxime dos equipamentos para conectar)
                      </span>
                    )}
                    {selectedTool === 'connect' && (
                      <span style={{ marginLeft: '10px', color: '#059669', fontStyle: 'italic' }}>
                        (Clique nas linhas para editar conexões)
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm('Tem certeza que deseja limpar todo o fluxograma?')) {
                        setEquipments([]);
                        setFlowLines([]);
                        setSimulationResults([]);
                        setEconomicResults(null);
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      marginRight: '10px'
                    }}
                  >
                    🗑️ Limpar
                  </button>
                  
                  <button
                    onClick={() => {
                      // Exemplo com mixer
                      const eq1: Equipment = {
                        id: 'EQ1',
                        type: 'britador',
                        name: 'Britador-1',
                        x: 80,
                        y: 100,
                        parameters: { power: 500, reduction: 5 },
                        inputs: [],
                        outputs: []
                      };
                      
                      const eq2: Equipment = {
                        id: 'EQ2',
                        type: 'moinho',
                        name: 'Moinho-1',
                        x: 250,
                        y: 80,
                        parameters: { power: 1000, diameter: 4.5 },
                        inputs: [],
                        outputs: []
                      };
                      
                      const eq3: Equipment = {
                        id: 'EQ3',
                        type: 'mixer',
                        name: 'Mixer-1',
                        x: 400,
                        y: 150,
                        parameters: { 
                          numberOfInputs: 2, 
                          numberOfOutputs: 1, 
                          mixingTime: 5, 
                          efficiency: 98,
                          components: {
                            'Fe': { feedGrade: 35, concentrate: 65, tailing: 8, recovery: 85 },
                            'SiO2': { feedGrade: 45, concentrate: 8, tailing: 65, recovery: 15 }
                          }
                        },
                        inputs: [],
                        outputs: []
                      };
                      
                      const eq4: Equipment = {
                        id: 'EQ4',
                        type: 'rougher',
                        name: 'Flotação-1',
                        x: 550,
                        y: 120,
                        parameters: { cellVolume: 100, numberOfCells: 4 },
                        inputs: [],
                        outputs: []
                      };
                      
                      const fl1: FlowLine = {
                        id: 'FL1',
                        name: 'Feed-Principal',
                        startX: 105,
                        startY: 125,
                        endX: 275,
                        endY: 105,
                        angle: 0,
                        length: 170,
                        flowRate: 800,
                        solidPercent: 70,
                        density: 2.8,
                        fromEquipment: 'EQ1',
                        toEquipment: 'EQ2',
                        style: 'solid',
                        color: '#333',
                        particleSize: 2000,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 }
                      };
                      
                      const fl2: FlowLine = {
                        id: 'FL2',
                        name: 'Polpa-Moída',
                        startX: 275,
                        startY: 105,
                        endX: 425,
                        endY: 160,
                        angle: 30,
                        length: 180,
                        flowRate: 750,
                        solidPercent: 35,
                        density: 2.8,
                        fromEquipment: 'EQ2',
                        toEquipment: 'EQ3',
                        style: 'solid',
                        color: '#4a90b8',
                        particleSize: 150,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 }
                      };
                      
                      const fl3: FlowLine = {
                        id: 'FL3',
                        name: 'Água-Processo',
                        startX: 350,
                        startY: 50,
                        endX: 420,
                        endY: 140,
                        angle: 60,
                        length: 120,
                        flowRate: 200,
                        solidPercent: 0,
                        density: 1.0,
                        toEquipment: 'EQ3',
                        style: 'dashed',
                        color: '#0066cc',
                        particleSize: 0,
                        pressure: 150,
                        temperature: 25,
                        components: [],
                        componentGrades: {}
                      };
                      
                      const fl4: FlowLine = {
                        id: 'FL4',
                        name: 'Feed-Flotação',
                        startX: 425,
                        startY: 175,
                        endX: 575,
                        endY: 145,
                        angle: -20,
                        length: 160,
                        flowRate: 950,
                        solidPercent: 28,
                        density: 2.2,
                        fromEquipment: 'EQ3',
                        toEquipment: 'EQ4',
                        style: 'solid',
                        color: '#27ae60',
                        particleSize: 150,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 }
                      };
                      
                      setEquipments([eq1, eq2, eq3, eq4]);
                      setFlowLines([fl1, fl2, fl3, fl4]);
                      setNextEquipmentId(5);
                      setNextFlowLineId(5);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#2ecc71',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      marginLeft: 'auto'
                    }}
                  >
                    🧪 Exemplo com Mixer
                  </button>
                  
                  <button
                    onClick={() => {
                      // Clear existing circuit
                      setEquipments([]);
                      setFlowLines([]);
                      setLogs([]);
                      
                      // Create iron ore processing circuit
                      const crusher = {
                        id: 'EQ1',
                        type: 'britador' as const,
                        name: 'Britador-1',
                        x: 100,
                        y: 150,
                        parameters: { 
                          power: 750, 
                          reduction: 8,
                          efficiency: 95,
                          targetSize: 1250
                        },
                        inputs: [],
                        outputs: []
                      };
                      
                      const mill = {
                        id: 'EQ2',
                        type: 'moinho' as const,
                        name: 'Moinho-1',
                        x: 300,
                        y: 150,
                        parameters: { 
                          power: 2500, 
                          diameter: 5.5, 
                          length: 7.5, 
                          ballLoad: 38, 
                          speed: 76,
                          workIndex: 12.8,
                          targetSize: 106
                        },
                        inputs: [],
                        outputs: []
                      };
                      
                      const rougher = {
                        id: 'EQ3',
                        type: 'rougher' as const,
                        name: 'Rougher-1',
                        x: 500,
                        y: 100,
                        parameters: { 
                          recovery: 88,
                          grade: 58,
                          numberOfCells: 6,
                          components: {
                            'fe': { feedGrade: 35, concentrate: 65, tailing: 8, recovery: 88 },
                            'sio2': { feedGrade: 45, concentrate: 8, tailing: 65, recovery: 12 },
                            'al2o3': { feedGrade: 12, concentrate: 2, tailing: 18, recovery: 8 }
                          }
                        },
                        inputs: [],
                        outputs: []
                      };
                      
                      const cleaner = {
                        id: 'EQ4',
                        type: 'cleaner' as const,
                        name: 'Cleaner-1',
                        x: 700,
                        y: 100,
                        parameters: { 
                          recovery: 75,
                          grade: 67,
                          numberOfCells: 3,
                          components: {
                            'fe': { feedGrade: 58, concentrate: 67, tailing: 25, recovery: 75 },
                            'sio2': { feedGrade: 8, concentrate: 4, tailing: 25, recovery: 35 },
                            'al2o3': { feedGrade: 2, concentrate: 1, tailing: 8, recovery: 30 }
                          }
                        },
                        inputs: [],
                        outputs: []
                      };
                      
                      // Create flow lines with iron ore composition
                      const feedLine = {
                        id: 'FL1',
                        name: 'Alimentação',
                        startX: 50,
                        startY: 175,
                        endX: 100,
                        endY: 175,
                        angle: 0,
                        length: 50,
                        flowRate: 1200,
                        solidPercent: 85,
                        density: 3.2,
                        particleSize: 10000,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 },
                        toEquipment: 'EQ1',
                        style: 'solid' as const,
                        color: '#8B4513'
                      };
                      
                      const crusherToMill = {
                        id: 'FL2',
                        name: 'Britado',
                        startX: 150,
                        startY: 175,
                        endX: 300,
                        endY: 175,
                        angle: 0,
                        length: 150,
                        flowRate: 1140,
                        solidPercent: 85,
                        density: 3.2,
                        particleSize: 1250,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 },
                        fromEquipment: 'EQ1',
                        toEquipment: 'EQ2',
                        style: 'solid' as const,
                        color: '#A0522D'
                      };
                      
                      const millToRougher = {
                        id: 'FL3',
                        name: 'Moído',
                        startX: 350,
                        startY: 175,
                        endX: 500,
                        endY: 125,
                        angle: -18,
                        length: 180,
                        flowRate: 1140,
                        solidPercent: 65,
                        density: 2.8,
                        particleSize: 106,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 35, 'sio2': 45, 'al2o3': 12 },
                        fromEquipment: 'EQ2',
                        toEquipment: 'EQ3',
                        style: 'solid' as const,
                        color: '#CD853F'
                      };
                      
                      const rougherToCleaner = {
                        id: 'FL4',
                        name: 'Rougher Conc',
                        startX: 550,
                        startY: 125,
                        endX: 700,
                        endY: 125,
                        angle: 0,
                        length: 150,
                        flowRate: 240,
                        solidPercent: 65,
                        density: 3.8,
                        particleSize: 106,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 58, 'sio2': 8, 'al2o3': 2 },
                        fromEquipment: 'EQ3',
                        toEquipment: 'EQ4',
                        style: 'solid' as const,
                        color: '#B22222'
                      };
                      
                      const rougherTailing = {
                        id: 'FL5',
                        name: 'Rougher Tail',
                        startX: 550,
                        startY: 175,
                        endX: 650,
                        endY: 250,
                        angle: 45,
                        length: 120,
                        flowRate: 900,
                        solidPercent: 35,
                        density: 2.6,
                        particleSize: 106,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 8, 'sio2': 65, 'al2o3': 18 },
                        fromEquipment: 'EQ3',
                        style: 'solid' as const,
                        color: '#708090'
                      };
                      
                      const finalConcentrate = {
                        id: 'FL6',
                        name: 'Concentrado Final',
                        startX: 750,
                        startY: 125,
                        endX: 850,
                        endY: 50,
                        angle: -35,
                        length: 120,
                        flowRate: 180,
                        solidPercent: 70,
                        density: 4.2,
                        particleSize: 106,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 67, 'sio2': 4, 'al2o3': 1 },
                        fromEquipment: 'EQ4',
                        style: 'solid' as const,
                        color: '#DC143C'
                      };
                      
                      const cleanerTailing = {
                        id: 'FL7',
                        name: 'Cleaner Tail',
                        startX: 750,
                        startY: 175,
                        endX: 620,
                        endY: 225,
                        angle: 140,
                        length: 140,
                        flowRate: 60,
                        solidPercent: 45,
                        density: 2.9,
                        particleSize: 106,
                        pressure: 101.3,
                        temperature: 25,
                        components: ['fe', 'sio2', 'al2o3'],
                        componentGrades: { 'fe': 25, 'sio2': 25, 'al2o3': 8 },
                        fromEquipment: 'EQ4',
                        style: 'dashed' as const,
                        color: '#696969'
                      };
                      
                      // Activate iron ore components
                      setMineralComponents(prev => prev.map(comp => ({
                        ...comp,
                        isActive: ['fe', 'sio2', 'al2o3'].includes(comp.id)
                      })));
                      
                      setEquipments([crusher, mill, rougher, cleaner]);
                      setFlowLines([feedLine, crusherToMill, millToRougher, rougherToCleaner, rougherTailing, finalConcentrate, cleanerTailing]);
                      setNextEquipmentId(5);
                      setNextFlowLineId(8);
                      
                      addLog('success', 'example', 'Exemplo de minério de ferro carregado', 
                             'Circuito completo: britagem → moagem → flotação rougher → flotação cleaner');
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      marginLeft: '8px'
                    }}
                  >
                    ⛏️ Exemplo Minério de Ferro
                  </button>
                  
                  <button
                    onClick={() => {
                      if (flowLines.length === 0) {
                        alert('Primeiro carregue um exemplo ou crie um fluxograma!');
                        return;
                      }
                      
                      // Execute simulation with iterative balance
                      executeSimulation();
                    }}
                    disabled={isSimulating || flowLines.length === 0}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: isSimulating ? '#bdc3c7' : '#8e44ad',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: isSimulating || flowLines.length === 0 ? 'not-allowed' : 'pointer',
                      marginLeft: '8px'
                    }}
                  >
                    {isSimulating ? '⏳ Processando...' : '🧮 Teste Balanço Iterativo'}
                  </button>
                </div>
                
                <div
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  style={{
                    flex: 1,
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    position: 'relative',
                    cursor: selectedTool === 'flowline' ? 'crosshair' : 
                           selectedTool === 'connect' ? 'cell' : 
                           draggingEquipment ? 'grabbing' :
                           selectedTool ? 'copy' : 'default',
                    backgroundImage: 'radial-gradient(#ddd 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                    overflow: 'hidden'
                  }}
                >
                  {/* Renderizar linhas de fluxo */}
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                    {flowLines.map(line => renderFlowLine(line, hoveredLineId === line.id))}
                    {drawingLine && renderFlowLine(drawingLine, false)}
                  </svg>
                  
                  {/* Renderizar equipamentos */}
                  {equipments.map(equipment => renderEquipment(equipment))}
                </div>
                
                {/* Status Panel */}
                <div style={{
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '10px',
                  marginTop: '10px',
                  fontSize: '11px'
                }}>
                  <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
                    <div>🔧 Equipamentos: <strong>{equipments.length}</strong></div>
                    <div>🌀 Mixers: <strong>{equipments.filter(eq => eq.type === 'mixer').length}</strong></div>
                    <div>➡️ Correntes: <strong>{flowLines.length}</strong></div>
                    <div>🔗 Conexões: <strong>{flowLines.filter(fl => fl.fromEquipment && fl.toEquipment).length}</strong></div>
                    {flowLines.length > 0 && (
                      <div>📊 Vazão Total: <strong>{flowLines.reduce((sum, fl) => sum + fl.flowRate, 0).toFixed(1)} t/h</strong></div>
                    )}
                    {equipments.some(eq => eq.type === 'mixer') && (
                      <div style={{ fontSize: '10px', color: '#f39c12', fontStyle: 'italic' }}>
                        🌀 Balanço metalúrgico ativo
                      </div>
                    )}
                    {mineralComponents.filter(c => c.isActive).length > 0 && (
                      <div style={{ fontSize: '10px', color: '#8e44ad', fontStyle: 'italic' }}>
                        🧪 {mineralComponents.filter(c => c.isActive).length} componentes ativos
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Logs Panel */}
                <div style={{
                  backgroundColor: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  marginTop: '10px',
                  maxHeight: '200px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: '#2d2d2d',
                    borderBottom: '1px solid #444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ color: '#00ff00', fontSize: '12px', fontWeight: 'bold' }}>📝 LOGS</span>
                    <span style={{ color: '#888', fontSize: '10px' }}>
                      {logs.length} entradas • {logs.filter(l => l.type === 'error').length} erros • {logs.filter(l => l.type === 'warning').length} avisos
                    </span>
                    <button
                      onClick={() => setLogs([])}
                      style={{
                        marginLeft: 'auto',
                        padding: '2px 6px',
                        fontSize: '9px',
                        backgroundColor: '#666',
                        color: 'white',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️ Limpar
                    </button>
                  </div>
                  
                  <div style={{ 
                    flex: 1, 
                    overflowY: 'auto',
                    maxHeight: '150px',
                    padding: '5px'
                  }}>
                    {logs.length === 0 ? (
                      <div style={{ 
                        color: '#666', 
                        fontSize: '11px', 
                        fontStyle: 'italic',
                        textAlign: 'center',
                        padding: '20px' 
                      }}>
                        Nenhum log disponível. Interaja com o fluxograma para ver o histórico.
                      </div>
                    ) : (
                      logs.map(log => (
                        <div
                          key={log.id}
                          onClick={() => {
                            if (log.action) {
                              log.action();
                            }
                          }}
                          style={{
                            padding: '5px 8px',
                            fontSize: '10px',
                            borderBottom: '1px solid #333',
                            cursor: log.action ? 'pointer' : 'default',
                            backgroundColor: log.action ? '#2a2a2a' : 'transparent'
                          }}
                          onMouseEnter={(e) => {
                            if (log.action) {
                              e.currentTarget.style.backgroundColor = '#3a3a3a';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (log.action) {
                              e.currentTarget.style.backgroundColor = '#2a2a2a';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              color: log.type === 'error' ? '#ff6b6b' : 
                                     log.type === 'warning' ? '#ffa726' : 
                                     log.type === 'success' ? '#4caf50' : '#81d4fa',
                              fontSize: '11px'
                            }}>
                              {log.type === 'error' ? '❌' : 
                               log.type === 'warning' ? '⚠️' : 
                               log.type === 'success' ? '✅' : 'ℹ️'}
                            </span>
                            <span style={{ color: '#888', fontSize: '9px', minWidth: '50px' }}>
                              {log.timestamp.toLocaleTimeString('pt-BR', { 
                                hour: '2-digit', 
                                minute: '2-digit', 
                                second: '2-digit' 
                              })}
                            </span>
                            <span style={{ 
                              color: 'white', 
                              fontSize: '10px',
                              flex: 1
                            }}>
                              {log.message}
                            </span>
                            {log.category && (
                              <span style={{
                                backgroundColor: '#555',
                                color: '#ccc',
                                padding: '1px 4px',
                                borderRadius: '2px',
                                fontSize: '8px',
                                textTransform: 'uppercase'
                              }}>
                                {log.category}
                              </span>
                            )}
                          </div>
                          {log.details && (
                            <div style={{ 
                              color: '#bbb', 
                              fontSize: '9px', 
                              marginTop: '2px',
                              marginLeft: '35px',
                              fontStyle: 'italic'
                            }}>
                              {log.details}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentPage === 'parameters' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Configuração da Simulação</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', maxWidth: '600px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Taxa de Alimentação (t/h)</label>
                  <input
                    type="number"
                    value={simulationConfig.feedRate}
                    onChange={(e) => setSimulationConfig({...simulationConfig, feedRate: Number(e.target.value)})}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Densidade do Minério (g/cm³)</label>
                  <input
                    type="number"
                    value={simulationConfig.oreDensity}
                    onChange={(e) => setSimulationConfig({...simulationConfig, oreDensity: Number(e.target.value)})}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>% Sólidos</label>
                  <input
                    type="number"
                    value={simulationConfig.solidPercent}
                    onChange={(e) => setSimulationConfig({...simulationConfig, solidPercent: Number(e.target.value)})}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Tempo de Simulação (h)</label>
                  <input
                    type="number"
                    value={simulationConfig.simulationTime}
                    onChange={(e) => setSimulationConfig({...simulationConfig, simulationTime: Number(e.target.value)})}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {currentPage === 'results' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Resultados da Simulação</h2>
              
              {/* DETAILED STREAMS TABLE WITH COMPONENT BREAKDOWN */}
              {detailedStreams.length > 0 ? (
                <div style={{ marginBottom: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ fontSize: '16px', margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📊 Tabela Detalhada de Balanço de Massa
                      <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                        ({detailedStreams.length} correntes | {iterativeResult?.converged ? '✅ Convergido' : '⚠️ Parcial'})
                      </span>
                      {iterativeResult && (
                        <span style={{ 
                          fontSize: '11px', 
                          color: iterativeResult.converged ? '#28a745' : '#ffc107',
                          backgroundColor: iterativeResult.converged ? '#d4edda' : '#fff3cd',
                          padding: '2px 6px',
                          borderRadius: '3px'
                        }}>
                          {iterativeResult.iterations} iter. | Erro: {iterativeResult.maxError.toFixed(6)}%
                        </span>
                      )}
                    </h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                          Componentes minerais:
                        </label>
                        <button
                          onClick={() => setShowMineralComponents(!showMineralComponents)}
                          style={{
                            padding: '3px 6px',
                            border: 'none',
                            borderRadius: '3px',
                            backgroundColor: showMineralComponents ? '#28a745' : '#6c757d',
                            color: 'white',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {showMineralComponents ? '✅' : '❌'}
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                          Elementos principais:
                        </label>
                        <button
                          onClick={() => setShowPureElements(!showPureElements)}
                          style={{
                            padding: '3px 6px',
                            border: 'none',
                            borderRadius: '3px',
                            backgroundColor: showPureElements ? '#17a2b8' : '#6c757d',
                            color: 'white',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {showPureElements ? '✅' : '❌'}
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                          Todos elementos:
                        </label>
                        <button
                          onClick={() => setShowAllChemicalElements(!showAllChemicalElements)}
                          style={{
                            padding: '3px 6px',
                            border: 'none',
                            borderRadius: '3px',
                            backgroundColor: showAllChemicalElements ? '#dc3545' : '#6c757d',
                            color: 'white',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {showAllChemicalElements ? '✅' : '❌'}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: '4px' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: '11px',
                      backgroundColor: 'white'
                    }}>
                      <thead style={{ backgroundColor: '#343a40', color: 'white' }}>
                        <tr>
                          <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'left', fontWeight: 'bold', minWidth: '120px' }}>
                            Corrente
                          </th>
                          <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'center', fontWeight: 'bold' }}>
                            Vazão Mássica<br/>(t/h)
                          </th>
                          <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'center', fontWeight: 'bold' }}>
                            Vazão Polpa<br/>(m³/h)
                          </th>
                          <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'center', fontWeight: 'bold' }}>
                            Vazão H₂O<br/>(m³/h)
                          </th>
                          <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'center', fontWeight: 'bold' }}>
                            % Sólidos
                          </th>
                          {showMineralComponents && mineralComponents.filter(c => c.isActive).map(comp => (
                            <th key={comp.id} style={{ 
                              padding: '8px 4px', 
                              border: '1px solid #495057', 
                              textAlign: 'center', 
                              fontWeight: 'bold',
                              backgroundColor: comp.color,
                              color: 'white',
                              minWidth: '80px'
                            }}>
                              {comp.symbol}<br/>
                              <span style={{ fontSize: '9px', fontWeight: 'normal' }}>t/h (% massa)</span>
                            </th>
                          ))}
                          {showPureElements && mineralComponents.filter(c => c.isActive).map(comp => (
                            <th key={`pure-${comp.id}`} style={{ 
                              padding: '8px 4px', 
                              border: '1px solid #495057', 
                              textAlign: 'center', 
                              fontWeight: 'bold',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              minWidth: '60px'
                            }}>
                              %{comp.id === 'fe' ? 'Fe' : comp.id === 'sio2' ? 'Si' : comp.id === 'al2o3' ? 'Al' : comp.id === 'p' ? 'P' : comp.id.toUpperCase()}<br/>
                              <span style={{ fontSize: '9px', fontWeight: 'normal' }}>elemento puro</span>
                            </th>
                          ))}
                          {showAllChemicalElements && getAllChemicalElements().map(element => (
                            <th key={`all-${element}`} style={{ 
                              padding: '6px 3px', 
                              border: '1px solid #495057', 
                              textAlign: 'center', 
                              fontWeight: 'bold',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              minWidth: '45px'
                            }}>
                              %{element}<br/>
                              <span style={{ fontSize: '8px', fontWeight: 'normal' }}>químico</span>
                            </th>
                          ))}
                          {(showMineralComponents || showPureElements || showAllChemicalElements) && (
                            <th style={{ padding: '12px 6px', border: '1px solid #495057', textAlign: 'center', fontWeight: 'bold' }}>
                              Soma<br/>Componentes
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {detailedStreams.map((stream, index) => {
                          const flowLine = flowLines[index];
                          if (!flowLine) return null;
                          
                          // Calculate separate volumetric flows
                          const solidFlow = stream.flowRate * (stream.solidPercent / 100);
                          const waterFlow = stream.flowRate - solidFlow;
                          const pulpVolumetricFlow = stream.volumetricFlow; // Total pulp
                          const waterVolumetricFlow = waterFlow / 1.0; // Water density = 1.0 g/cm³
                          
                          const totalComponentPercentage = (showMineralComponents || showPureElements || showAllChemicalElements) ? 
                            mineralComponents
                              .filter(c => c.isActive)
                              .reduce((sum, comp) => sum + (stream.componentPercentages[comp.id] || 0), 0) : 0;
                          
                          return (
                            <tr key={index} style={{ 
                              backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                              borderBottom: '1px solid #dee2e6'
                            }}>
                              <td style={{ padding: '8px 6px', border: '1px solid #dee2e6', fontWeight: 'bold' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <div style={{
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: flowLine.color || '#333',
                                    borderRadius: '2px'
                                  }} />
                                  <span style={{ fontSize: '12px' }}>{flowLine.name}</span>
                                </div>
                                <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                                  {flowLine.style === 'dashed' ? 'Tracejada' : 
                                   flowLine.style === 'recycle' ? 'Reciclo' : 'Principal'}
                                </div>
                              </td>
                              
                              <td style={{ padding: '8px 6px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                                {stream.flowRate.toFixed(2)}
                              </td>
                              
                              <td style={{ padding: '8px 6px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
                                {pulpVolumetricFlow.toFixed(2)}
                              </td>
                              
                              <td style={{ padding: '8px 6px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', color: '#007bff' }}>
                                {waterVolumetricFlow.toFixed(2)}
                              </td>
                              
                              <td style={{ padding: '8px 6px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                                {stream.solidPercent.toFixed(1)}%
                              </td>
                              
                              {showMineralComponents && mineralComponents.filter(c => c.isActive).map(comp => {
                                const massValue = stream.componentMass[comp.id] || 0;
                                const percentage = stream.componentPercentages[comp.id] || 0;
                                
                                return (
                                  <td key={comp.id} style={{ 
                                    padding: '6px 4px', 
                                    border: '1px solid #dee2e6', 
                                    textAlign: 'center',
                                    backgroundColor: percentage > 0 ? `${comp.color}15` : 'transparent'
                                  }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '11px', color: comp.color }}>
                                      {massValue.toFixed(3)}
                                    </div>
                                    <div style={{ fontSize: '9px', color: '#666' }}>
                                      ({percentage.toFixed(2)}%)
                                    </div>
                                  </td>
                                );
                              })}
                              
                              {showPureElements && mineralComponents.filter(c => c.isActive).map(comp => {
                                // Calculate pure element percentage (simplified conversion)
                                const mineralPercentage = stream.componentPercentages[comp.id] || 0;
                                const pureElementPercentage = mineralPercentage * (
                                  comp.id === 'fe' ? 0.70 : // Fe2O3 -> Fe (70% Fe)
                                  comp.id === 'sio2' ? 0.47 : // SiO2 -> Si (47% Si) 
                                  comp.id === 'al2o3' ? 0.53 : // Al2O3 -> Al (53% Al)
                                  comp.id === 'p' ? 0.44 : // P2O5 -> P (44% P)
                                  0.5 // Default conversion factor
                                );
                                
                                return (
                                  <td key={`pure-${comp.id}`} style={{ 
                                    padding: '6px 4px', 
                                    border: '1px solid #dee2e6', 
                                    textAlign: 'center',
                                    backgroundColor: pureElementPercentage > 0 ? '#17a2b820' : 'transparent'
                                  }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#17a2b8' }}>
                                      {pureElementPercentage.toFixed(2)}%
                                    </div>
                                  </td>
                                );
                              })}
                              
                              {showAllChemicalElements && getAllChemicalElements().map(element => {
                                // Calculate element percentage from all minerals containing this element
                                let totalElementPercentage = 0;
                                
                                mineralComponents
                                  .filter(c => c.isActive && c.chemicalElements && c.chemicalElements[element])
                                  .forEach(mineral => {
                                    const mineralPercentage = stream.componentPercentages[mineral.id] || 0;
                                    const elementFactor = mineral.chemicalElements![element];
                                    totalElementPercentage += mineralPercentage * elementFactor;
                                  });
                                
                                return (
                                  <td key={`all-${element}`} style={{ 
                                    padding: '4px 2px', 
                                    border: '1px solid #dee2e6', 
                                    textAlign: 'center',
                                    backgroundColor: totalElementPercentage > 0 ? '#dc354520' : 'transparent'
                                  }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#dc3545' }}>
                                      {totalElementPercentage.toFixed(2)}%
                                    </div>
                                  </td>
                                );
                              })}
                              
                              {(showMineralComponents || showPureElements || showAllChemicalElements) && (
                                <td style={{ 
                                  padding: '8px 6px', 
                                  border: '1px solid #dee2e6', 
                                  textAlign: 'center',
                                  backgroundColor: Math.abs(totalComponentPercentage - 100) < 0.1 ? '#d4edda' : '#f8d7da',
                                  fontWeight: 'bold',
                                  fontSize: '11px'
                                }}>
                                  {totalComponentPercentage.toFixed(2)}%
                                  <div style={{ fontSize: '8px', color: '#666' }}>
                                    {Math.abs(totalComponentPercentage - 100) < 0.1 ? '✓ OK' : '⚠️ Erro'}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Mass Balance Summary */}
                  {iterativeResult && (
                    <div style={{ 
                      marginTop: '15px',
                      padding: '15px',
                      backgroundColor: iterativeResult.converged ? '#d4edda' : '#fff3cd',
                      border: `2px solid ${iterativeResult.converged ? '#c3e6cb' : '#ffeaa7'}`,
                      borderRadius: '6px'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <div>
                          <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#495057' }}>
                            🎯 Status da Convergência
                          </h4>
                          <div style={{ fontSize: '11px' }}>
                            <div><strong>Iterações:</strong> {iterativeResult.iterations}/50</div>
                            <div><strong>Convergiu:</strong> {iterativeResult.converged ? '✅ Sim' : '❌ Não'}</div>
                            <div><strong>Erro Global:</strong> {iterativeResult.globalError.toFixed(6)}%</div>
                            <div><strong>Erro Máximo:</strong> {iterativeResult.maxError.toFixed(6)}%</div>
                          </div>
                        </div>
                        
                        <div>
                          <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#495057' }}>
                            🧪 Erros por Componente
                          </h4>
                          <div style={{ fontSize: '10px' }}>
                            {Object.entries(iterativeResult.componentErrors).map(([compId, error]) => {
                              const comp = mineralComponents.find(c => c.id === compId);
                              const status = error < 0.001 ? '✅' : error < 0.01 ? '⚠️' : '❌';
                              return (
                                <div key={compId}>
                                  <strong>{comp?.symbol || compId}:</strong> {status} {error.toFixed(6)}%
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {coherenceReport.length > 0 && (
                          <div>
                            <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#495057' }}>
                              🔍 Coerência dos Resultados
                            </h4>
                            <div style={{ fontSize: '10px', maxHeight: '80px', overflowY: 'auto' }}>
                              {coherenceReport.slice(0, 5).map((report, idx) => (
                                <div key={idx} style={{ 
                                  marginBottom: '2px',
                                  color: report.includes('ERROR') ? '#dc3545' : 
                                         report.includes('WARNING') ? '#ffc107' : '#28a745'
                                }}>
                                  {report}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Fallback to basic flowLines table if no detailed streams
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ➡️ Correntes do Fluxograma
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                      ({flowLines.length} correntes)
                    </span>
                  <button
                    onClick={() => {
                      // Force update of component data
                      const updatedLines = flowLines.map(line => ({
                        ...line,
                        components: line.components || [],
                        componentGrades: line.componentGrades || {}
                      }));
                      setFlowLines(updatedLines);
                    }}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 8px',
                      fontSize: '10px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Atualizar Dados
                  </button>
                </h3>
                
                {flowLines.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      backgroundColor: 'white',
                      border: '1px solid #dee2e6'
                    }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'left', fontWeight: 'bold' }}>
                            Corrente
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            Vazão<br/>(t/h)
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            % Sólidos
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            Densidade<br/>(g/cm³)
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            P80<br/>(µm)
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            Pressão<br/>(kPa)
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            Temp.<br/>(°C)
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'left', fontWeight: 'bold' }}>
                            Componentes
                          </th>
                          <th style={{ padding: '12px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                            Conexões
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flowLines.map((line, index) => (
                          <tr key={line.id} style={{ 
                            backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                            borderBottom: '1px solid #dee2e6'
                          }}>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                  width: '12px',
                                  height: '12px',
                                  backgroundColor: line.color || '#333',
                                  borderRadius: '2px',
                                  border: '1px solid #ccc'
                                }} />
                                <div>
                                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{line.name}</div>
                                  <div style={{ fontSize: '10px', color: '#666' }}>
                                    {line.style === 'dashed' ? '⋯ Tracejada' : 
                                     line.style === 'recycle' ? '↻ Reciclo' : '─ Sólida'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                              {line.flowRate.toFixed(1)}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              {line.solidPercent.toFixed(1)}%
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              {line.density.toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              {line.particleSize?.toFixed(0) || '-'}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              {line.pressure?.toFixed(1) || '-'}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              {line.temperature?.toFixed(0) || '-'}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6' }}>
                              {line.components && line.components.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {line.components.map(compId => {
                                    const component = mineralComponents.find(c => c.id === compId);
                                    const grade = line.componentGrades?.[compId];
                                    return component ? (
                                      <div key={compId} style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px',
                                        fontSize: '10px'
                                      }}>
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          backgroundColor: component.color,
                                          borderRadius: '1px'
                                        }} />
                                        <span>{component.symbol}: <strong>{grade?.toFixed(2)}%</strong></span>
                                      </div>
                                    ) : null;
                                  })}
                                </div>
                              ) : (
                                <span style={{ color: '#999', fontSize: '10px' }}>Nenhum</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                              <div style={{ fontSize: '10px' }}>
                                {line.fromEquipment && (
                                  <div style={{ color: '#4a90b8' }}>
                                    ⬅️ {equipments.find(eq => eq.id === line.fromEquipment)?.name || 'N/A'}
                                    {line.fromPort !== undefined && ` (${line.fromPort + 1})`}
                                  </div>
                                )}
                                {line.toEquipment && (
                                  <div style={{ color: '#059669' }}>
                                    ➡️ {equipments.find(eq => eq.id === line.toEquipment)?.name || 'N/A'}
                                    {line.toPort !== undefined && ` (${line.toPort + 1})`}
                                  </div>
                                )}
                                {!line.fromEquipment && !line.toEquipment && (
                                  <span style={{ color: '#dc3545' }}>❌ Desconectada</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '6px',
                    border: '2px dashed #dee2e6'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>➡️</div>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>Nenhuma corrente criada ainda</p>
                    <p style={{ fontSize: '12px', color: '#999' }}>Desenhe linhas de fluxo na área de simulação</p>
                  </div>
                )}
              </div>
              )}

              {/* Resumo Geral das Correntes */}
              {flowLines.length > 0 && (
                <div style={{ 
                  marginBottom: '30px',
                  padding: '20px',
                  backgroundColor: '#e8f4fd',
                  borderRadius: '6px',
                  border: '1px solid #b8daff'
                }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '15px', color: '#0c5aa6' }}>📊 Resumo do Circuito</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0c5aa6' }}>
                        {flowLines.reduce((sum, fl) => sum + fl.flowRate, 0).toFixed(1)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Vazão Total (t/h)</div>
                    </div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                        {flowLines.filter(fl => fl.fromEquipment && fl.toEquipment).length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Correntes Conectadas</div>
                    </div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffc107' }}>
                        {flowLines.filter(fl => !fl.fromEquipment || !fl.toEquipment).length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Correntes Soltas</div>
                    </div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8e44ad' }}>
                        {Array.from(new Set(flowLines.flatMap(fl => fl.components || []))).length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Componentes Únicos</div>
                    </div>
                  </div>
                  
                  {/* Balanço geral por componente */}
                  {Array.from(new Set(flowLines.flatMap(fl => fl.components || []))).length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                      <h5 style={{ fontSize: '13px', marginBottom: '10px', color: '#495057' }}>🧪 Balanço Geral de Componentes</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                        {Array.from(new Set(flowLines.flatMap(fl => fl.components || []))).map(compId => {
                          const component = mineralComponents.find(c => c.id === compId);
                          if (!component) return null;
                          
                          const totalComponentMass = flowLines.reduce((sum, fl) => {
                            const grade = fl.componentGrades?.[compId] || 0;
                            return sum + (fl.flowRate * grade / 100);
                          }, 0);
                          
                          const avgGrade = flowLines.length > 0 ? 
                            flowLines.reduce((sum, fl) => sum + (fl.componentGrades?.[compId] || 0), 0) / flowLines.length : 0;
                          
                          return (
                            <div key={compId} style={{ 
                              padding: '10px',
                              backgroundColor: 'white',
                              borderRadius: '4px',
                              border: '1px solid #dee2e6',
                              textAlign: 'center'
                            }}>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '5px',
                                marginBottom: '5px'
                              }}>
                                <div style={{
                                  width: '10px',
                                  height: '10px',
                                  backgroundColor: component.color,
                                  borderRadius: '2px'
                                }} />
                                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{component.symbol}</span>
                              </div>
                              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#495057' }}>
                                {totalComponentMass.toFixed(1)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#6c757d' }}>t/h total</div>
                              <div style={{ fontSize: '10px', color: '#6c757d', marginTop: '2px' }}>
                                Teor médio: {avgGrade.toFixed(2)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Resultados da Simulação (se houver) */}
              {simulationResults.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#2c3e50' }}>📊 Resultados por Equipamento</h3>
                  
                  {simulationResults.map((result, index) => (
                    <div key={index} style={{ 
                      marginBottom: '20px', 
                      padding: '15px', 
                      backgroundColor: '#f8f9fa', 
                      borderRadius: '4px',
                      border: '1px solid #e1e4e8'
                    }}>
                      <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#333' }}>
                        🔧 {result.equipment}
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                          <h5 style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Entradas:</h5>
                          {result.inputs.map((input, i) => (
                            <div key={i} style={{ fontSize: '11px', color: '#333', marginBottom: '4px' }}>
                              • Vazão: {input.flowRate.toFixed(2)} t/h | 
                              P80: {input.particleSize.toFixed(0)} µm | 
                              Sólidos: {input.solidPercent}%
                            </div>
                          ))}
                        </div>
                        
                        <div>
                          <h5 style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Saídas:</h5>
                          {result.outputs.map((output, i) => (
                            <div key={i} style={{ fontSize: '11px', color: '#333', marginBottom: '4px' }}>
                              • Vazão: {output.flowRate.toFixed(2)} t/h | 
                              P80: {output.particleSize.toFixed(0)} µm | 
                              Sólidos: {output.solidPercent}%
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                        <div style={{ fontSize: '12px', display: 'flex', gap: '30px' }}>
                          <span>⚡ Potência: <strong>{result.powerConsumption.toFixed(0)} kW</strong></span>
                          <span>📈 Eficiência: <strong>{result.efficiency.toFixed(1)}%</strong></span>
                          {result.equipment.includes('Mixer') && (
                            <span>🌀 Entradas: <strong>{result.inputs.length}</strong></span>
                          )}
                        </div>
                        
                        {result.warnings.length > 0 && (
                          <div style={{ marginTop: '8px', padding: '5px 10px', backgroundColor: '#fff3cd', borderRadius: '3px', fontSize: '11px', color: '#856404' }}>
                            ⚠️ {result.warnings.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#1565c0' }}>📈 Indicadores Gerais</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1565c0' }}>
                          {simulationResults.reduce((sum, r) => sum + r.powerConsumption, 0).toFixed(0)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Potência Total (kW)</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388e3c' }}>
                          {(simulationResults.reduce((sum, r) => sum + r.efficiency, 0) / simulationResults.length).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Eficiência Média</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f57c00' }}>
                          {simulationConfig.feedRate}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Feed Rate (t/h)</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Mensagem quando não há simulação */}
              {simulationResults.length === 0 && flowLines.length > 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '30px', 
                  backgroundColor: '#fff3e0',
                  borderRadius: '6px',
                  border: '1px solid #ffcc02'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚡</div>
                  <p style={{ fontSize: '14px', color: '#856404', marginBottom: '10px' }}>
                    Fluxograma configurado! Execute a simulação para ver os resultados calculados.
                  </p>
                  <button
                    onClick={executeSimulation}
                    disabled={isSimulating}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    {isSimulating ? '⏳ Simulando...' : '▶️ Executar Simulação'}
                  </button>
                </div>
              )}
              
              {/* Mensagem quando não há correntes */}
              {flowLines.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
                  <p style={{ fontSize: '14px' }}>Nenhuma corrente de fluxo criada ainda.</p>
                  <p style={{ fontSize: '12px', marginTop: '10px' }}>Configure seu fluxograma na aba "Simulação" e execute para ver os resultados.</p>
                </div>
              )}
            </div>
          )}

          {currentPage === 'economy' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', margin: 0 }}>Análise Econômica</h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '14px', color: '#666' }}>Habilitar Cálculos Econômicos:</label>
                  <button
                    onClick={() => setEconomyEnabled(!economyEnabled)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: economyEnabled ? '#28a745' : '#6c757d',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {economyEnabled ? '✅ Habilitado' : '❌ Desabilitado'}
                  </button>
                </div>
              </div>
              
              {!economyEnabled ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>💰</div>
                  <p style={{ fontSize: '14px', marginBottom: '10px' }}>Análise econômica desabilitada</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>Habilite acima para incluir cálculos econômicos na simulação</p>
                </div>
              ) : economicResults ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
                    <div style={{ padding: '15px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>💰 CAPEX</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f57c00' }}>
                        ${(economicResults.capitalCost / 1000000).toFixed(1)}M
                      </div>
                      <div style={{ fontSize: '10px', color: '#999' }}>Investimento Inicial</div>
                    </div>
                    
                    <div style={{ padding: '15px', backgroundColor: '#fce4ec', borderRadius: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>📊 OPEX</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c2185b' }}>
                        ${(economicResults.operatingCost / 1000000).toFixed(1)}M/ano
                      </div>
                      <div style={{ fontSize: '10px', color: '#999' }}>Custo Operacional</div>
                    </div>
                    
                    <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>💵 Receita</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#388e3c' }}>
                        ${(economicResults.revenue / 1000000).toFixed(1)}M/ano
                      </div>
                      <div style={{ fontSize: '10px', color: '#999' }}>Receita Anual</div>
                    </div>
                  </div>
                  
                  <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>📈 Indicadores Financeiros</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>VPL (NPV)</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: economicResults.npv > 0 ? '#388e3c' : '#f44336' }}>
                            ${(economicResults.npv / 1000000).toFixed(2)}M
                          </div>
                          {economicResults.npv > 0 ? (
                            <span style={{ fontSize: '10px', color: '#388e3c' }}>✅ Projeto Viável</span>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#f44336' }}>❌ Projeto Inviável</span>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>TIR (IRR)</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>
                            {economicResults.irr.toFixed(1)}%
                          </div>
                          <span style={{ fontSize: '10px', color: '#999' }}>Taxa Interna de Retorno</span>
                        </div>
                      </div>
                      
                      <div>
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Payback</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#7b1fa2' }}>
                            {economicResults.paybackPeriod.toFixed(1)} anos
                          </div>
                          <span style={{ fontSize: '10px', color: '#999' }}>Período de Retorno</span>
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Lucro Anual</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#00796b' }}>
                            ${((economicResults.revenue - economicResults.operatingCost) / 1000000).toFixed(1)}M
                          </div>
                          <span style={{ fontSize: '10px', color: '#999' }}>EBITDA Estimado</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                    <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#1565c0' }}>💡 Recomendações</h4>
                    <ul style={{ fontSize: '12px', color: '#555', paddingLeft: '20px', margin: 0 }}>
                      {economicResults.npv > 0 && <li>Projeto economicamente viável com VPL positivo</li>}
                      {economicResults.paybackPeriod < 5 && <li>Período de payback atrativo (menor que 5 anos)</li>}
                      {economicResults.irr > 15 && <li>TIR acima da taxa de desconto mínima (15%)</li>}
                      {economicResults.npv < 0 && <li>⚠️ Considere otimizar custos operacionais ou aumentar recuperação</li>}
                      {economicResults.paybackPeriod > 10 && <li>⚠️ Período de payback longo, avaliar riscos</li>}
                    </ul>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>💰</div>
                  <p style={{ fontSize: '14px' }}>Execute uma simulação com economia habilitada para ver a análise econômica.</p>
                </div>
              )}
            </div>
          )}

          {currentPage === 'charts' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', margin: 0 }}>Gráficos e Visualizações</h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '14px', color: '#666' }}>Habilitar Gráficos:</label>
                  <button
                    onClick={() => setChartsEnabled(!chartsEnabled)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: chartsEnabled ? '#28a745' : '#6c757d',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {chartsEnabled ? '✅ Habilitado' : '❌ Desabilitado'}
                  </button>
                </div>
              </div>
              
              {!chartsEnabled ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
                  <p style={{ fontSize: '14px', marginBottom: '10px' }}>Gráficos desabilitados</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>Habilite acima para incluir visualizações gráficas na simulação</p>
                </div>
              ) : simulationResults.length > 0 ? (
                <div>
                  {/* Distribuição de Potência */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>⚡ Distribuição de Potência</h3>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', height: '200px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                      {simulationResults.map((result, index) => {
                        const maxPower = Math.max(...simulationResults.map(r => r.powerConsumption));
                        const height = (result.powerConsumption / maxPower) * 180;
                        return (
                          <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{
                              width: '100%',
                              height: `${height}px`,
                              backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'][index % 5],
                              borderRadius: '4px 4px 0 0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              {result.powerConsumption.toFixed(0)}
                            </div>
                            <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '5px', color: '#666' }}>
                              {result.equipment}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px', color: '#999' }}>
                      Consumo de Potência (kW)
                    </div>
                  </div>
                  
                  {/* Eficiência por Equipamento */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>📊 Eficiência por Equipamento</h3>
                    <div style={{ padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                      {simulationResults.map((result, index) => (
                        <div key={index} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                            <div style={{ fontSize: '12px', width: '120px', color: '#666' }}>{result.equipment}</div>
                            <div style={{ flex: 1, height: '20px', backgroundColor: '#e0e0e0', borderRadius: '10px', position: 'relative', overflow: 'hidden' }}>
                              <div style={{
                                width: `${result.efficiency}%`,
                                height: '100%',
                                backgroundColor: result.efficiency > 80 ? '#4caf50' : result.efficiency > 60 ? '#ff9800' : '#f44336',
                                borderRadius: '10px',
                                transition: 'width 0.5s ease'
                              }} />
                              <div style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: result.efficiency > 50 ? 'white' : '#333'
                              }}>
                                {result.efficiency.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Redução de Tamanho de Partícula */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>🔬 Redução Granulométrica</h3>
                    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>10,000 µm</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>Alimentação</div>
                        </div>
                        
                        <div style={{ flex: 1, margin: '0 20px' }}>
                          <svg width="100%" height="40">
                            <defs>
                              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
                              </marker>
                            </defs>
                            <line x1="0" y1="20" x2="100%" y2="20" stroke="#666" strokeWidth="2" markerEnd="url(#arrowhead)" />
                          </svg>
                        </div>
                        
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>150 µm</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>Produto Final</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '12px', color: '#999' }}>
                        Redução: {((10000 - 150) / 10000 * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
                  <p style={{ fontSize: '14px' }}>Execute uma simulação com gráficos habilitados para ver as visualizações.</p>
                </div>
              )}
            </div>
          )}

          {currentPage === 'optimization' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', margin: 0 }}>Otimização</h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '14px', color: '#666' }}>Habilitar Otimização:</label>
                  <button
                    onClick={() => setOptimizationEnabled(!optimizationEnabled)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: optimizationEnabled ? '#28a745' : '#6c757d',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {optimizationEnabled ? '✅ Habilitado' : '❌ Desabilitado'}
                  </button>
                </div>
              </div>
              
              {!optimizationEnabled ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>⚙️</div>
                  <p style={{ fontSize: '14px', marginBottom: '10px' }}>Otimização desabilitada</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>Habilite acima para incluir análise de otimização na simulação</p>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#666', fontSize: '14px' }}>Otimização de parâmetros do processo.</p>
                  <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
                    <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#f57c00' }}>🎯 Funcionalidades Disponíveis:</h4>
                    <ul style={{ fontSize: '12px', color: '#555', paddingLeft: '20px', margin: 0 }}>
                      <li>Otimização automática de eficiência dos equipamentos</li>
                      <li>Ajuste de parâmetros para maximizar recuperação</li>
                      <li>Análise de sensibilidade dos parâmetros</li>
                      <li>Sugestões de melhorias no circuito</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentPage === 'reports' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Relatórios</h2>
              <p style={{ color: '#666', fontSize: '14px' }}>Geração de relatórios detalhados.</p>
            </div>
          )}

          {currentPage === 'help' && (
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Ajuda</h2>
              <div style={{ fontSize: '14px', color: '#333', lineHeight: '1.6' }}>
                <h3 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '10px' }}>Como usar o simulador:</h3>
                <ol style={{ paddingLeft: '20px' }}>
                  <li>Selecione uma ferramenta na paleta lateral</li>
                  <li>Para equipamentos: Clique no canvas para adicionar</li>
                  <li>Para linhas de fluxo: Clique e arraste para desenhar</li>
                  <li>Clique com botão direito para editar ou deletar</li>
                  <li>Configure parâmetros na aba Parâmetros</li>
                  <li>Execute a simulação com o botão Executar</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Menu de Contexto */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 9999,
            minWidth: '150px',
            padding: '5px 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.equipmentId && (
            <>
              <button
                onClick={() => editEquipment(contextMenu.equipmentId!)}
                style={{
                  width: '100%',
                  padding: '8px 15px',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                ⚙️ Editar Parâmetros
              </button>
              <button
                onClick={() => deleteEquipment(contextMenu.equipmentId!)}
                style={{
                  width: '100%',
                  padding: '8px 15px',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: '#e74c3c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🗑️ Deletar
              </button>
            </>
          )}
          {contextMenu.flowLineId && (
            <>
              <button
                onClick={() => editFlowLine(contextMenu.flowLineId!)}
                style={{
                  width: '100%',
                  padding: '8px 15px',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                ✏️ Editar Corrente
              </button>
              <button
                onClick={() => deleteFlowLine(contextMenu.flowLineId!)}
                style={{
                  width: '100%',
                  padding: '8px 15px',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: '#e74c3c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🗑️ Deletar Corrente
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal de Edição de Equipamento */}
      {showEditModal && editingEquipment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>Editar {editingEquipment.name}</h3>
            
            <div>
              {/* Parâmetros Operacionais */}
              <div>
                <h4 style={{ fontSize: '14px', marginBottom: '15px', color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                  ⚙️ Parâmetros Operacionais
                </h4>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Nome</label>
                  <input
                    type="text"
                    value={editingEquipment.name}
                    onChange={(e) => setEditingEquipment({...editingEquipment, name: e.target.value})}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>

            {editingEquipment.type === 'moinho' && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Potência (kW)</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.power || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, power: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Diâmetro (m)</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.diameter || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, diameter: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </>
            )}

            {editingEquipment.type === 'mixer' && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Número de Entradas</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={editingEquipment.parameters.numberOfInputs || 2}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, numberOfInputs: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Número de Saídas</label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={editingEquipment.parameters.numberOfOutputs || 1}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, numberOfOutputs: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Tempo de Mistura (min)</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.mixingTime || 5}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, mixingTime: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Eficiência de Mistura (%)</label>
                  <input
                    type="number"
                    min="80"
                    max="100"
                    value={editingEquipment.parameters.efficiency || 98}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, efficiency: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </>
            )}

            {editingEquipment.type === 'britador' && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Potência (kW)</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.power || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, power: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Razão de Redução</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.reduction || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, reduction: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </>
            )}

            {(editingEquipment.type === 'rougher' || editingEquipment.type === 'cleaner' || editingEquipment.type === 'recleaner') && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Volume da Célula (m³)</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.cellVolume || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, cellVolume: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Número de Células</label>
                  <input
                    type="number"
                    value={editingEquipment.parameters.numberOfCells || 0}
                    onChange={(e) => setEditingEquipment({
                      ...editingEquipment,
                      parameters: {...editingEquipment.parameters, numberOfCells: Number(e.target.value)}
                    })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </>
            )}
            </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => saveEquipment(editingEquipment)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEquipment(null);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Linha de Fluxo */}
      {showFlowEditModal && editingFlowLine && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '400px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>Editar Corrente de Fluxo</h3>
            
            {/* Status de conexão */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '10px', 
              backgroundColor: (!editingFlowLine.fromEquipment || !editingFlowLine.toEquipment) ? '#fff3cd' : '#d4edda',
              borderRadius: '4px',
              border: '1px solid ' + ((!editingFlowLine.fromEquipment || !editingFlowLine.toEquipment) ? '#ffeaa7' : '#c3e6cb')
            }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                Status da Conexão:
              </div>
              <div style={{ fontSize: '11px', display: 'flex', gap: '15px' }}>
                <span style={{ color: editingFlowLine.fromEquipment ? '#28a745' : '#dc3545' }}>
                  {editingFlowLine.fromEquipment ? '✅ Origem conectada' : '❌ Origem desconectada'}
                </span>
                <span style={{ color: editingFlowLine.toEquipment ? '#28a745' : '#dc3545' }}>
                  {editingFlowLine.toEquipment ? '✅ Destino conectado' : '❌ Destino desconectado'}
                </span>
              </div>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Nome da Corrente</label>
              <input
                type="text"
                value={editingFlowLine.name}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, name: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Equipamento de Origem</label>
              <select
                value={editingFlowLine.fromEquipment || ''}
                onChange={(e) => {
                  const equipmentId = e.target.value;
                  if (equipmentId) {
                    connectLineToEquipment(editingFlowLine.id, equipmentId, true);
                    const equipment = equipments.find(eq => eq.id === equipmentId);
                    if (equipment) {
                      let x, y;
                      if (equipment.type === 'mixer') {
                        x = equipment.x + 50; // Output side
                        y = equipment.y + 20;
                      } else {
                        x = equipment.x + 25;
                        y = equipment.y + 25;
                      }
                      setEditingFlowLine({
                        ...editingFlowLine,
                        fromEquipment: equipmentId,
                        startX: x,
                        startY: y,
                        fromPort: 0
                      });
                    }
                  } else {
                    setEditingFlowLine({...editingFlowLine, fromEquipment: undefined, fromPort: undefined});
                  }
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Sem conexão</option>
                {equipments.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>

            {/* Port selection for mixer origin */}
            {editingFlowLine.fromEquipment && equipments.find(eq => eq.id === editingFlowLine.fromEquipment)?.type === 'mixer' && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Porta de Saída</label>
                <select
                  value={editingFlowLine.fromPort || 0}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    const equipment = equipments.find(eq => eq.id === editingFlowLine.fromEquipment);
                    if (equipment) {
                      const x = equipment.x + 50;
                      const y = equipment.y + 20 + port * 15;
                      setEditingFlowLine({
                        ...editingFlowLine,
                        fromPort: port,
                        startX: x,
                        startY: y
                      });
                    }
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  {Array.from({ length: equipments.find(eq => eq.id === editingFlowLine.fromEquipment)?.parameters.numberOfOutputs || 1 }, (_, i) => (
                    <option key={i} value={i}>Saída {i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Equipamento de Destino</label>
              <select
                value={editingFlowLine.toEquipment || ''}
                onChange={(e) => {
                  const equipmentId = e.target.value;
                  if (equipmentId) {
                    connectLineToEquipment(editingFlowLine.id, equipmentId, false);
                    const equipment = equipments.find(eq => eq.id === equipmentId);
                    if (equipment) {
                      let x, y;
                      if (equipment.type === 'mixer') {
                        x = equipment.x; // Input side
                        y = equipment.y + 10;
                      } else {
                        x = equipment.x + 25;
                        y = equipment.y + 25;
                      }
                      setEditingFlowLine({
                        ...editingFlowLine,
                        toEquipment: equipmentId,
                        endX: x,
                        endY: y,
                        toPort: 0
                      });
                    }
                  } else {
                    setEditingFlowLine({...editingFlowLine, toEquipment: undefined, toPort: undefined});
                  }
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Sem conexão</option>
                {equipments.filter(eq => eq.id !== editingFlowLine.fromEquipment).map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>

            {/* Port selection for mixer destination */}
            {editingFlowLine.toEquipment && equipments.find(eq => eq.id === editingFlowLine.toEquipment)?.type === 'mixer' && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Porta de Entrada</label>
                <select
                  value={editingFlowLine.toPort || 0}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    const equipment = equipments.find(eq => eq.id === editingFlowLine.toEquipment);
                    if (equipment) {
                      const x = equipment.x;
                      const y = equipment.y + 10 + port * 15;
                      setEditingFlowLine({
                        ...editingFlowLine,
                        toPort: port,
                        endX: x,
                        endY: y
                      });
                    }
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  {Array.from({ length: equipments.find(eq => eq.id === editingFlowLine.toEquipment)?.parameters.numberOfInputs || 2 }, (_, i) => (
                    <option key={i} value={i}>Entrada {i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Vazão (t/h)</label>
              <input
                type="number"
                value={editingFlowLine.flowRate}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, flowRate: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>% Sólidos</label>
              <input
                type="number"
                value={editingFlowLine.solidPercent}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, solidPercent: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Densidade (g/cm³)</label>
              <input
                type="number"
                value={editingFlowLine.density}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, density: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Estilo da Linha</label>
              <select
                value={editingFlowLine.style || 'solid'}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, style: e.target.value as FlowLine['style']})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="solid">Sólida (Normal)</option>
                <option value="dashed">Tracejada (Bypass)</option>
                <option value="recycle">Reciclo (Grossa)</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Cor da Linha</label>
              <select
                value={editingFlowLine.color || '#333'}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, color: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="#333">Preto (Padrão)</option>
                <option value="#4a90b8">Azul (Água)</option>
                <option value="#059669">Verde (Produto)</option>
                <option value="#dc2626">Vermelho (Rejeito)</option>
                <option value="#7c3aed">Roxo (Reagente)</option>
                <option value="#f59e0b">Laranja (Ar)</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Granulometria P80 (µm)</label>
              <input
                type="number"
                value={editingFlowLine.particleSize || 0}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, particleSize: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Pressão (kPa)</label>
              <input
                type="number"
                value={editingFlowLine.pressure || 101.3}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, pressure: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Temperatura (°C)</label>
              <input
                type="number"
                value={editingFlowLine.temperature || 25}
                onChange={(e) => setEditingFlowLine({...editingFlowLine, temperature: Number(e.target.value)})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            {/* Seleção de Componentes */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                🧪 Componentes Presentes na Corrente
              </label>
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                padding: '10px', 
                maxHeight: '150px', 
                overflow: 'auto',
                backgroundColor: '#f8f9fa'
              }}>
                {mineralComponents.filter(c => c.isActive).map(component => (
                  <div key={component.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '8px',
                    padding: '6px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    border: '1px solid #e1e4e8'
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: component.color,
                      borderRadius: '2px',
                      marginRight: '8px',
                      border: '1px solid #ccc'
                    }} />
                    
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      cursor: 'pointer',
                      fontSize: '11px',
                      flex: 1
                    }}>
                      <input
                        type="checkbox"
                        checked={editingFlowLine.components?.includes(component.id) || false}
                        onChange={(e) => {
                          let newComponents = [...(editingFlowLine.components || [])];
                          let newGrades = { ...(editingFlowLine.componentGrades || {}) };
                          
                          if (e.target.checked) {
                            if (!newComponents.includes(component.id)) {
                              newComponents.push(component.id);
                              newGrades[component.id] = component.defaultGrade;
                            }
                          } else {
                            newComponents = newComponents.filter(id => id !== component.id);
                            delete newGrades[component.id];
                          }
                          
                          setEditingFlowLine({
                            ...editingFlowLine,
                            components: newComponents,
                            componentGrades: newGrades
                          });
                        }}
                      />
                      <span><strong>{component.name}</strong> ({component.symbol})</span>
                    </label>
                    
                    {editingFlowLine.components?.includes(component.id) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: '#666' }}>Teor:</span>
                        <input
                          type="number"
                          step="0.1"
                          value={editingFlowLine.componentGrades?.[component.id] || component.defaultGrade}
                          onChange={(e) => {
                            const newGrades = { ...(editingFlowLine.componentGrades || {}) };
                            newGrades[component.id] = Number(e.target.value);
                            setEditingFlowLine({
                              ...editingFlowLine,
                              componentGrades: newGrades
                            });
                          }}
                          style={{ 
                            width: '50px', 
                            padding: '2px 4px', 
                            border: '1px solid #ddd', 
                            borderRadius: '3px', 
                            fontSize: '10px',
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '10px', color: '#666' }}>%</span>
                      </div>
                    )}
                  </div>
                ))}
                
                {mineralComponents.filter(c => c.isActive).length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', fontSize: '11px', padding: '10px' }}>
                    Nenhum componente ativo. Configure em "🧪 Componentes"
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Ângulo (graus)</label>
              <input
                type="number"
                value={Math.round(editingFlowLine.angle)}
                onChange={(e) => {
                  const angle = Number(e.target.value) * (Math.PI / 180);
                  const length = editingFlowLine.length;
                  setEditingFlowLine({
                    ...editingFlowLine,
                    angle: Number(e.target.value),
                    endX: editingFlowLine.startX + length * Math.cos(angle),
                    endY: editingFlowLine.startY + length * Math.sin(angle)
                  });
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Comprimento (pixels)</label>
              <input
                type="number"
                value={Math.round(editingFlowLine.length)}
                onChange={(e) => {
                  const length = Number(e.target.value);
                  const angle = editingFlowLine.angle * (Math.PI / 180);
                  setEditingFlowLine({
                    ...editingFlowLine,
                    length,
                    endX: editingFlowLine.startX + length * Math.cos(angle),
                    endY: editingFlowLine.startY + length * Math.sin(angle)
                  });
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => saveFlowLine(editingFlowLine)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  setShowFlowEditModal(false);
                  setEditingFlowLine(null);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Componentes Minerais */}
      {showComponentsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '25px',
            width: '900px',
            maxHeight: '85vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', color: '#2c3e50' }}>🧪 Biblioteca de Componentes Minerais</h3>
              <button
                onClick={() => setShowComponentsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#999'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#495057' }}>📖 Informações Técnicas</h4>
              <p style={{ fontSize: '12px', color: '#6c757d', marginBottom: '8px' }}>
                <strong>Work Index (Wi):</strong> Energia necessária para reduzir 1 tonelada de material de tamanho infinito para 100 µm (kWh/t)
              </p>
              <p style={{ fontSize: '12px', color: '#6c757d', marginBottom: '8px' }}>
                <strong>Abrasion Index (Ai):</strong> Índice de desgaste do material (adimensional)
              </p>
              <p style={{ fontSize: '12px', color: '#6c757d' }}>
                <strong>Liberação:</strong> Tamanho médio onde o mineral se libera da ganga (µm)
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
              {mineralComponents.map((component, index) => (
                <div key={component.id} style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: component.isActive ? '#f8fff8' : '#f8f9fa'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: component.color,
                      borderRadius: '3px',
                      marginRight: '10px',
                      border: '1px solid #ccc'
                    }} />
                    <div>
                      <h5 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0, color: '#2c3e50' }}>
                        {component.name}
                      </h5>
                      <div style={{ fontSize: '11px', color: '#6c757d' }}>{component.symbol}</div>
                    </div>
                    <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={component.isActive}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].isActive = e.target.checked;
                          setMineralComponents(updated);
                        }}
                      />
                      <span style={{ fontSize: '12px' }}>Ativo</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Densidade (g/cm³)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={component.density}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].density = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Dens. Específica (g/cm³)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={component.specificDensity}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].specificDensity = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Work Index (kWh/t)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={component.workIndex}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].workIndex = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Abrasion Index</label>
                      <input
                        type="number"
                        step="0.01"
                        value={component.abrasionIndex}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].abrasionIndex = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Dureza (Mohs)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={component.hardness}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].hardness = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Liberação (µm)</label>
                      <input
                        type="number"
                        value={component.liberation}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].liberation = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Teor Padrão (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={component.defaultGrade}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].defaultGrade = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Valor Econômico ($/% ton)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={component.economicValue}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].economicValue = Number(e.target.value);
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Magnetismo</label>
                      <select
                        value={component.magnetism}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].magnetism = e.target.value as MineralComponent['magnetism'];
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      >
                        <option value="magnetic">Magnético</option>
                        <option value="weakly_magnetic">Fracamente Magnético</option>
                        <option value="non_magnetic">Não Magnético</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '3px', color: '#666' }}>Flotabilidade</label>
                      <select
                        value={component.flotability}
                        onChange={(e) => {
                          const updated = [...mineralComponents];
                          updated[index].flotability = e.target.value as MineralComponent['flotability'];
                          setMineralComponents(updated);
                        }}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px' }}
                      >
                        <option value="high">Alta</option>
                        <option value="medium">Média</option>
                        <option value="low">Baixa</option>
                        <option value="non_floatable">Não Flotável</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '6px' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#1565c0' }}>📊 Resumo dos Componentes Ativos</h4>
              <div style={{ display: 'flex', gap: '30px', fontSize: '12px' }}>
                <div>
                  <strong>Ativos:</strong> {mineralComponents.filter(c => c.isActive).length}
                </div>
                <div>
                  <strong>Densidades:</strong> {mineralComponents.filter(c => c.isActive).map(c => c.density.toFixed(2)).join(', ')} g/cm³
                </div>
                <div>
                  <strong>Work Index Médio:</strong> {
                    (mineralComponents.filter(c => c.isActive).reduce((sum, c) => sum + c.workIndex, 0) / 
                     mineralComponents.filter(c => c.isActive).length).toFixed(1)
                  } kWh/t
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  // Add new custom mineral
                  const name = prompt('Nome do novo mineral:');
                  if (name) {
                    const newComponent: MineralComponent = {
                      id: name.toLowerCase().replace(/\s+/g, '_'),
                      name,
                      symbol: name,
                      color: '#' + Math.floor(Math.random()*16777215).toString(16),
                      density: 2.8,
                      specificDensity: 2.8,
                      workIndex: 13,
                      abrasionIndex: 0.2,
                      hardness: 5,
                      liberation: 50,
                      magnetism: 'non_magnetic',
                      flotability: 'medium',
                      defaultGrade: 1,
                      economicValue: 0,
                      isActive: false
                    };
                    setMineralComponents(prev => [...prev, newComponent]);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ➕ Adicionar Mineral
              </button>
              
              <button
                onClick={() => {
                  // Reset to defaults
                  if (confirm('Resetar todos os componentes para valores padrão?')) {
                    // Re-initialize with default values
                    setMineralComponents(prev => prev.map(comp => ({
                      ...comp,
                      isActive: ['fe', 'sio2', 'al2o3', 'p'].includes(comp.id)
                    })));
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#ffc107',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                🔄 Resetar Padrões
              </button>
              
              <button
                onClick={() => setShowComponentsModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✅ Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}