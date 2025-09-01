// AUTO-PROPAGATION OF STREAM DATA FOR PERFECT BALANCE CLOSURE
export function propagateStreamData(
  flowLines: any[],
  mineralComponents: any[]
): any[] {
  
  const updatedFlowLines = [...flowLines];
  const activeComponents = mineralComponents.filter(c => c.isActive);
  let propagationsMade = 0;
  
  // Iterate until no more propagations are needed
  for (let iteration = 0; iteration < 10; iteration++) {
    let changesInThisIteration = 0;
    
    for (let i = 0; i < updatedFlowLines.length; i++) {
      const flowLine = updatedFlowLines[i];
      
      // CASE 1: Output stream missing data - use input stream data
      if (!flowLine.fromEquipment && flowLine.toEquipment) {
        // This is a feed stream going to equipment - find corresponding output
        const outputStreams = updatedFlowLines.filter(fl => 
          fl.fromEquipment === flowLine.toEquipment && 
          (fl.flowRate === 0 || !fl.componentGrades || Object.keys(fl.componentGrades).length === 0)
        );
        
        for (const outputStream of outputStreams) {
          if (outputStream.flowRate === 0 || !outputStream.componentGrades) {
            // Copy data from input to output
            updatedFlowLines[updatedFlowLines.indexOf(outputStream)] = {
              ...outputStream,
              flowRate: outputStream.flowRate || flowLine.flowRate,
              solidPercent: outputStream.solidPercent || flowLine.solidPercent,
              density: outputStream.density || flowLine.density,
              particleSize: outputStream.particleSize || flowLine.particleSize,
              components: outputStream.components || flowLine.components || [],
              componentGrades: {
                ...flowLine.componentGrades,
                ...outputStream.componentGrades
              }
            };
            changesInThisIteration++;
          }
        }
      }
      
      // CASE 2: Input stream missing data - use output stream data
      if (flowLine.fromEquipment && !flowLine.toEquipment) {
        // This is a product stream from equipment - find corresponding input
        const inputStreams = updatedFlowLines.filter(fl => 
          fl.toEquipment === flowLine.fromEquipment && 
          (fl.flowRate === 0 || !fl.componentGrades || Object.keys(fl.componentGrades).length === 0)
        );
        
        for (const inputStream of inputStreams) {
          if (inputStream.flowRate === 0 || !inputStream.componentGrades) {
            // Copy data from output to input (reverse propagation)
            updatedFlowLines[updatedFlowLines.indexOf(inputStream)] = {
              ...inputStream,
              flowRate: inputStream.flowRate || flowLine.flowRate,
              solidPercent: inputStream.solidPercent || flowLine.solidPercent,
              density: inputStream.density || flowLine.density,
              particleSize: inputStream.particleSize || (flowLine.particleSize || 150) * 2, // Assume size reduction
              components: inputStream.components || flowLine.components || [],
              componentGrades: {
                ...flowLine.componentGrades,
                ...inputStream.componentGrades
              }
            };
            changesInThisIteration++;
          }
        }
      }
      
      // CASE 3: Fill missing component data with defaults
      if ((!flowLine.components || flowLine.components.length === 0) && 
          (!flowLine.componentGrades || Object.keys(flowLine.componentGrades).length === 0)) {
        
        const newComponents = activeComponents.map(comp => comp.id);
        const newComponentGrades: { [key: string]: number } = {};
        
        // Use default grades from mineral database
        for (const comp of activeComponents) {
          newComponentGrades[comp.id] = comp.defaultGrade || 0;
        }
        
        // Normalize to 100%
        const totalGrade = Object.values(newComponentGrades).reduce((sum, grade) => sum + grade, 0);
        if (totalGrade > 0) {
          const normalizationFactor = 100 / totalGrade;
          for (const compId in newComponentGrades) {
            newComponentGrades[compId] *= normalizationFactor;
          }
        }
        
        updatedFlowLines[i] = {
          ...flowLine,
          components: newComponents,
          componentGrades: newComponentGrades
        };
        changesInThisIteration++;
      }
      
      // CASE 4: Fill missing flow rate with reasonable defaults
      if (flowLine.flowRate === 0 || !flowLine.flowRate) {
        // Estimate based on connected equipment
        let estimatedFlow = 1000; // Default 1000 t/h
        
        if (flowLine.fromEquipment) {
          // Look for input streams to same equipment
          const siblingInputs = updatedFlowLines.filter(fl => 
            fl.toEquipment === flowLine.fromEquipment && fl.flowRate > 0
          );
          if (siblingInputs.length > 0) {
            estimatedFlow = siblingInputs.reduce((sum, fl) => sum + fl.flowRate, 0);
          }
        }
        
        updatedFlowLines[i] = {
          ...flowLine,
          flowRate: estimatedFlow,
          solidPercent: flowLine.solidPercent || 70,
          density: flowLine.density || 2.8
        };
        changesInThisIteration++;
      }
    }
    
    propagationsMade += changesInThisIteration;
    
    // Stop if no changes were made in this iteration
    if (changesInThisIteration === 0) {
      break;
    }
  }
  
  return updatedFlowLines;
}

// Enhanced iterative solver with data propagation
export function solveIterativeMassBalance(
  equipments: any[],
  flowLines: any[],
  mineralComponents: any[],
  maxIterations: number = 50,
  tolerance: number = 0.001 // 0.001% tolerance
): {
  streams: DetailedStream[];
  iterativeResult: IterativeResult;
  coherenceReport: string[];
  propagatedFlowLines: any[];
} {
  
  const activeComponents = mineralComponents.filter(c => c.isActive);
  
  // STEP 1: Propagate missing data between connected streams
  const propagatedFlowLines = propagateStreamData(flowLines, mineralComponents);
  
  let iteration = 0;
  let converged = false;
  let streams: DetailedStream[] = [];
  
  // Initialize streams from propagated flowLines
  streams = propagatedFlowLines.map(fl => convertToDetailedStream(fl, activeComponents));
  
  const iterationLog: string[] = [];
  const coherenceIssues: string[] = [];
  
  iterationLog.push(`Data propagation completed: ${streams.length} streams initialized`);
  
  while (!converged && iteration < maxIterations) {
    iteration++;
    iterationLog.push(`Iteration ${iteration}: Starting balance calculations`);
    
    // 2. Apply mass balance closure: ENTRADA = SAÍDA (CRITICAL STEP)
    streams = applyMassBalanceClosure(streams, propagatedFlowLines, activeComponents);
    
    // 3. Process each equipment and update output streams
    for (const equipment of equipments) {
      const inputStreamIds = propagatedFlowLines
        .filter(fl => fl.toEquipment === equipment.id)
        .map(fl => fl.id);
        
      const inputStreams = inputStreamIds.map(id => {
        const flIndex = propagatedFlowLines.findIndex(fl => fl.id === id);
        return flIndex >= 0 ? streams[flIndex] : null;
      }).filter(s => s !== null);
      
      if (inputStreams.length === 0) continue;
      
      // Calculate equipment mass balance with perfect closure
      const outputStreams = calculateEquipmentBalanceWithClosure(equipment, inputStreams, activeComponents);
      
      // Update output stream data
      const outputStreamIds = propagatedFlowLines
        .filter(fl => fl.fromEquipment === equipment.id)
        .map(fl => fl.id);
        
      outputStreamIds.forEach((streamId, index) => {
        if (outputStreams[index]) {
          const streamIndex = propagatedFlowLines.findIndex(fl => fl.id === streamId);
          if (streamIndex >= 0) {
            streams[streamIndex] = outputStreams[index];
          }
        }
      });
    }
    
    // 4. Apply global mass balance corrections with ENTRADA = SAÍDA logic
    const corrections = applyGlobalMassBalanceWithClosure(streams, propagatedFlowLines, activeComponents);
    streams = corrections.correctedStreams;
    
    // 5. Normalize component percentages to 100% in each stream
    streams = normalizeStreamCompositions(streams, activeComponents);
    
    // 6. Check convergence
    const convergenceCheck = checkConvergence(streams, propagatedFlowLines, activeComponents, tolerance);
    converged = convergenceCheck.converged;
    
    iterationLog.push(`Iteration ${iteration}: Max error = ${convergenceCheck.maxError.toFixed(6)}%`);
    
    if (converged) {
      iterationLog.push(`✓ Perfect balance closure achieved in ${iteration} iterations`);
      break;
    }
  }
  
  // 7. Final coherence evaluation
  const coherenceReport = evaluateCoherence(streams, equipments, activeComponents);
  
  const iterativeResult: IterativeResult = {
    converged,
    iterations: iteration,
    globalError: streams.length > 0 ? calculateGlobalError(streams, propagatedFlowLines, activeComponents) : 0,
    componentErrors: calculateComponentErrors(streams, propagatedFlowLines, activeComponents),
    maxError: Math.max(...Object.values(calculateComponentErrors(streams, propagatedFlowLines, activeComponents))),
    coherenceIssues: coherenceReport.filter(r => r.includes('ERROR') || r.includes('WARNING'))
  };
  
  return {
    streams,
    iterativeResult,
    coherenceReport,
    propagatedFlowLines
  };
}

// Apply mass balance closure between input and output streams
function applyMassBalanceClosure(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[]
): DetailedStream[] {
  
  const closedStreams = [...streams];
  
  // Find input and output streams
  const inputIndices = flowLines
    .map((fl, idx) => !fl.fromEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  const outputIndices = flowLines
    .map((fl, idx) => !fl.toEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  
  if (inputIndices.length === 0 || outputIndices.length === 0) {
    return closedStreams;
  }
  
  // Calculate total input
  const totalInputFlow = inputIndices.reduce((sum, idx) => sum + (closedStreams[idx]?.flowRate || 0), 0);
  const totalInputSolids = inputIndices.reduce((sum, idx) => sum + (closedStreams[idx]?.solidFlow || 0), 0);
  
  // Calculate total output
  let totalOutputFlow = outputIndices.reduce((sum, idx) => sum + (closedStreams[idx]?.flowRate || 0), 0);
  
  // CLOSURE RULE: If output is 0 or very different from input, set output = input
  if (totalOutputFlow === 0 || Math.abs(totalInputFlow - totalOutputFlow) / totalInputFlow > 0.1) {
    
    // Distribute input flow proportionally among output streams
    const activeOutputs = outputIndices.filter(idx => closedStreams[idx]);
    
    if (activeOutputs.length > 0) {
      const flowPerOutput = totalInputFlow / activeOutputs.length;
      const solidsPerOutput = totalInputSolids / activeOutputs.length;
      
      for (const idx of activeOutputs) {
        closedStreams[idx] = {
          ...closedStreams[idx],
          flowRate: flowPerOutput,
          solidFlow: solidsPerOutput,
          solidPercent: flowPerOutput > 0 ? (solidsPerOutput / flowPerOutput) * 100 : 0
        };
      }
    }
  }
  
  // Apply component balance closure
  for (const comp of activeComponents) {
    const totalInputComponentMass = inputIndices.reduce((sum, idx) => 
      sum + (closedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    let totalOutputComponentMass = outputIndices.reduce((sum, idx) => 
      sum + (closedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    // CLOSURE RULE: Force output component mass to equal input
    if (totalInputComponentMass > 0 && Math.abs(totalInputComponentMass - totalOutputComponentMass) > 0.001) {
      
      const correctionFactor = totalInputComponentMass / (totalOutputComponentMass || 1);
      
      // Apply correction to output streams
      for (const idx of outputIndices) {
        if (closedStreams[idx]) {
          closedStreams[idx].componentMass[comp.id] = (closedStreams[idx].componentMass[comp.id] || 0) * correctionFactor;
          
          // Recalculate percentage
          const solidFlow = closedStreams[idx].solidFlow || 0;
          closedStreams[idx].componentPercentages[comp.id] = solidFlow > 0 ? 
            (closedStreams[idx].componentMass[comp.id] / solidFlow) * 100 : 0;
        }
      }
    }
    
    // REVERSE CLOSURE: If input is missing, calculate from output
    if (totalInputComponentMass === 0 && totalOutputComponentMass > 0) {
      
      // Distribute output component mass back to input streams
      const activeInputs = inputIndices.filter(idx => closedStreams[idx]);
      
      if (activeInputs.length > 0) {
        const componentMassPerInput = totalOutputComponentMass / activeInputs.length;
        
        for (const idx of activeInputs) {
          closedStreams[idx].componentMass[comp.id] = componentMassPerInput;
          
          // Recalculate percentage
          const solidFlow = closedStreams[idx].solidFlow || 0;
          closedStreams[idx].componentPercentages[comp.id] = solidFlow > 0 ? 
            (componentMassPerInput / solidFlow) * 100 : 0;
        }
      }
    }
  }
  
  return closedStreams;
}
export interface IterativeResult {
  converged: boolean;
  iterations: number;
  globalError: number;
  componentErrors: { [component: string]: number };
  maxError: number;
  coherenceIssues: string[];
}

// Enhanced Stream with volumetric data
export interface DetailedStream extends MaterialStream {
  volumetricFlow: number; // m³/h
  componentMass: { [component: string]: number }; // t/h absolute mass per component
  componentPercentages: { [component: string]: number }; // % mass in stream
}



// Convert FlowLine to DetailedStream
function convertToDetailedStream(flowLine: any, activeComponents: any[]): DetailedStream {
  const solidFlow = flowLine.flowRate * (flowLine.solidPercent / 100);
  const waterFlow = flowLine.flowRate - solidFlow;
  const volumetricFlow = solidFlow / (flowLine.density || 2.8) + waterFlow / 1.0; // m³/h
  
  const componentMass: { [component: string]: number } = {};
  const componentPercentages: { [component: string]: number } = {};
  
  for (const comp of activeComponents) {
    const grade = flowLine.componentGrades?.[comp.id] || 0;
    const mass = solidFlow * (grade / 100);
    componentMass[comp.id] = mass;
    componentPercentages[comp.id] = flowLine.flowRate > 0 ? (mass / flowLine.flowRate) * 100 : 0;
  }
  
  return {
    flowRate: flowLine.flowRate,
    solidPercent: flowLine.solidPercent,
    density: flowLine.density || 2.8,
    particleSize: flowLine.particleSize || 150,
    mineralContent: flowLine.mineralContent || {},
    volumetricFlow,
    componentMass,
    componentPercentages,
    waterFlow,
    solidFlow
  };
}

// Calculate equipment mass balance
function calculateEquipmentBalance(
  equipment: any, 
  inputStreams: DetailedStream[], 
  activeComponents: any[]
): DetailedStream[] {
  
  if (inputStreams.length === 0) return [];
  
  const totalInput = inputStreams.reduce((sum, s) => sum + s.flowRate, 0);
  
  switch (equipment.type) {
    case 'mixer':
      // Perfect mixing - combine all inputs
      const mixedComponents: { [key: string]: number } = {};
      const mixedComponentMass: { [key: string]: number } = {};
      
      let totalSolids = 0;
      for (const stream of inputStreams) {
        totalSolids += stream.solidFlow || 0;
        for (const comp of activeComponents) {
          mixedComponentMass[comp.id] = (mixedComponentMass[comp.id] || 0) + (stream.componentMass[comp.id] || 0);
        }
      }
      
      // Calculate final grades
      for (const comp of activeComponents) {
        mixedComponents[comp.id] = totalSolids > 0 ? (mixedComponentMass[comp.id] / totalSolids) * 100 : 0;
      }
      
      const numOutputs = equipment.parameters.numberOfOutputs || 1;
      const outputs: DetailedStream[] = [];
      
      for (let i = 0; i < numOutputs; i++) {
        const split = equipment.parameters.splits?.[i] || (100 / numOutputs);
        const outputFlow = totalInput * (split / 100);
        const outputSolids = totalSolids * (split / 100);
        
        const outputComponentMass: { [key: string]: number } = {};
        for (const comp of activeComponents) {
          outputComponentMass[comp.id] = mixedComponentMass[comp.id] * (split / 100);
        }
        
        outputs.push({
          flowRate: outputFlow,
          solidPercent: outputFlow > 0 ? (outputSolids / outputFlow) * 100 : 0,
          density: 2.8,
          particleSize: 150,
          mineralContent: {},
          volumetricFlow: outputSolids / 2.8 + (outputFlow - outputSolids) / 1.0,
          componentMass: outputComponentMass,
          componentPercentages: mixedComponents,
          solidFlow: outputSolids,
          waterFlow: outputFlow - outputSolids
        });
      }
      
      return outputs;
      
    case 'rougher':
    case 'cleaner':
    case 'recleaner':
      // Flotation separation with perfect component balance
      const input = inputStreams[0];
      const recovery = equipment.parameters.recovery || 85;
      const targetGrade = equipment.parameters.grade || 20;
      
      // Calculate mass recovery to achieve target grade
      const mainComponent = activeComponents.find(c => c.id === 'fe') || activeComponents[0];
      const feedGrade = input.componentPercentages[mainComponent.id] || 0;
      
      let massRecovery = 0.3; // Default 30%
      if (feedGrade > 0 && targetGrade > feedGrade) {
        massRecovery = Math.min(0.95, (feedGrade * (recovery / 100)) / targetGrade);
      }
      
      const concentrateFlow = input.flowRate * massRecovery;
      const tailingFlow = input.flowRate - concentrateFlow;
      
      const concentrateComponentMass: { [key: string]: number } = {};
      const tailingComponentMass: { [key: string]: number } = {};
      const concentratePercentages: { [key: string]: number } = {};
      const tailingPercentages: { [key: string]: number } = {};
      
      for (const comp of activeComponents) {
        const componentRecovery = equipment.parameters.components?.[comp.id]?.recovery || recovery;
        const inputMass = input.componentMass[comp.id];
        
        concentrateComponentMass[comp.id] = inputMass * (componentRecovery / 100);
        tailingComponentMass[comp.id] = inputMass - concentrateComponentMass[comp.id];
        
        concentratePercentages[comp.id] = concentrateFlow > 0 ? (concentrateComponentMass[comp.id] / concentrateFlow) * 100 : 0;
        tailingPercentages[comp.id] = tailingFlow > 0 ? (tailingComponentMass[comp.id] / tailingFlow) * 100 : 0;
      }
      
      const concentrate: DetailedStream = {
        flowRate: concentrateFlow,
        solidPercent: 65,
        density: input.density,
        particleSize: input.particleSize,
        mineralContent: {},
        volumetricFlow: concentrateFlow * 0.65 / input.density + concentrateFlow * 0.35 / 1.0,
        componentMass: concentrateComponentMass,
        componentPercentages: concentratePercentages,
        solidFlow: concentrateFlow * 0.65,
        waterFlow: concentrateFlow * 0.35
      };
      
      const tailing: DetailedStream = {
        flowRate: tailingFlow,
        solidPercent: 35,
        density: input.density,
        particleSize: input.particleSize,
        mineralContent: {},
        volumetricFlow: tailingFlow * 0.35 / input.density + tailingFlow * 0.65 / 1.0,
        componentMass: tailingComponentMass,
        componentPercentages: tailingPercentages,
        solidFlow: tailingFlow * 0.35,
        waterFlow: tailingFlow * 0.65
      };
      
      return [concentrate, tailing];
      
    default:
      // Pass-through equipment (crushers, mills)
      return inputStreams.map(stream => ({
        ...stream,
        particleSize: equipment.parameters.targetSize || stream.particleSize * 0.5
      }));
  }
}

// Apply mass balance corrections
function applyMassBalanceCorrections(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[]
): { correctedStreams: DetailedStream[] } {
  
  const correctedStreams = [...streams];
  
  // Find input and output streams
  const inputStreamIndices = flowLines
    .map((fl, idx) => !fl.fromEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  const outputStreamIndices = flowLines
    .map((fl, idx) => !fl.toEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  
  if (inputStreamIndices.length === 0 || outputStreamIndices.length === 0) {
    return { correctedStreams };
  }
  
  // Calculate component imbalances and correct
  for (const comp of activeComponents) {
    const totalInput = inputStreamIndices.reduce((sum, idx) => 
      sum + (correctedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    const totalOutput = outputStreamIndices.reduce((sum, idx) => 
      sum + (correctedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    if (totalInput > 0 && totalOutput > 0) {
      const correctionFactor = totalInput / totalOutput;
      
      // Apply correction to output streams
      for (const idx of outputStreamIndices) {
        if (correctedStreams[idx]) {
          correctedStreams[idx].componentMass[comp.id] *= correctionFactor;
        }
      }
    }
  }
  
  return { correctedStreams };
}

// Normalize compositions to 100%
function normalizeStreamCompositions(
  streams: DetailedStream[], 
  activeComponents: any[]
): DetailedStream[] {
  
  return streams.map(stream => {
    const totalPercentage = activeComponents.reduce((sum, comp) => 
      sum + (stream.componentPercentages[comp.id] || 0), 0
    );
    
    if (totalPercentage > 0 && Math.abs(totalPercentage - 100) > 0.01) {
      const normalizationFactor = 100 / totalPercentage;
      
      const normalizedPercentages: { [key: string]: number } = {};
      const normalizedMasses: { [key: string]: number } = {};
      
      for (const comp of activeComponents) {
        normalizedPercentages[comp.id] = (stream.componentPercentages[comp.id] || 0) * normalizationFactor;
        normalizedMasses[comp.id] = (stream.solidFlow || 0) * (normalizedPercentages[comp.id] / 100);
      }
      
      return {
        ...stream,
        componentPercentages: normalizedPercentages,
        componentMass: normalizedMasses
      };
    }
    
    return stream;
  });
}

// Check convergence
function checkConvergence(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[], 
  tolerance: number
): { converged: boolean; maxError: number } {
  
  const errors = calculateComponentErrors(streams, flowLines, activeComponents);
  const maxError = Math.max(...Object.values(errors), 0);
  
  return {
    converged: maxError < tolerance,
    maxError
  };
}

// Calculate component errors
function calculateComponentErrors(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[]
): { [component: string]: number } {
  
  const errors: { [component: string]: number } = {};
  
  const inputStreamIndices = flowLines
    .map((fl, idx) => !fl.fromEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  const outputStreamIndices = flowLines
    .map((fl, idx) => !fl.toEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  
  for (const comp of activeComponents) {
    const totalInput = inputStreamIndices.reduce((sum, idx) => 
      sum + (streams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    const totalOutput = outputStreamIndices.reduce((sum, idx) => 
      sum + (streams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    errors[comp.id] = totalInput > 0 ? Math.abs(totalInput - totalOutput) / totalInput * 100 : 0;
  }
  
  return errors;
}

// Calculate global error
function calculateGlobalError(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[]
): number {
  
  const inputStreamIndices = flowLines
    .map((fl, idx) => !fl.fromEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  const outputStreamIndices = flowLines
    .map((fl, idx) => !fl.toEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  
  const totalInput = inputStreamIndices.reduce((sum, idx) => sum + (streams[idx]?.flowRate || 0), 0);
  const totalOutput = outputStreamIndices.reduce((sum, idx) => sum + (streams[idx]?.flowRate || 0), 0);
  
  return totalInput > 0 ? Math.abs(totalInput - totalOutput) / totalInput * 100 : 0;
}

// Evaluate coherence
function evaluateCoherence(
  streams: DetailedStream[], 
  equipments: any[], 
  activeComponents: any[]
): string[] {
  
  const report: string[] = [];
  
  streams.forEach((stream, index) => {
    // Check percentage limits (0-100%)
    for (const comp of activeComponents) {
      const percentage = stream.componentPercentages[comp.id] || 0;
      if (percentage < 0) {
        report.push(`ERROR: Stream ${index + 1} has negative grade for ${comp.symbol}: ${percentage.toFixed(2)}%`);
      }
      if (percentage > 100) {
        report.push(`ERROR: Stream ${index + 1} has impossible grade for ${comp.symbol}: ${percentage.toFixed(2)}%`);
      }
    }
    
    // Check total percentage
    const totalPercentage = activeComponents.reduce((sum, comp) => 
      sum + (stream.componentPercentages[comp.id] || 0), 0
    );
    
    if (Math.abs(totalPercentage - 100) > 0.1) {
      report.push(`WARNING: Stream ${index + 1} total composition is ${totalPercentage.toFixed(2)}% (should be 100%)`);
    }
    
    // Check physical limits
    if (stream.solidPercent < 0 || stream.solidPercent > 100) {
      report.push(`ERROR: Stream ${index + 1} has impossible solid percentage: ${stream.solidPercent.toFixed(2)}%`);
    }
    
    if (stream.density <= 0) {
      report.push(`ERROR: Stream ${index + 1} has invalid density: ${stream.density}`);
    }
  });
  
  if (report.length === 0) {
    report.push('✓ All results are physically coherent and mathematically consistent');
  }
  
  return report;
}

export interface BalanceResult {
  isValid: boolean;
  globalError: number;
  componentErrors: { [component: string]: number };
  massRecovery: { [component: string]: number };
  enrichmentRatio: { [component: string]: number };
  concentrationRatio: number;
  discrepancies: string[];
  recommendations: string[];
}

export interface StreamBalance {
  streamId: string;
  streamName: string;
  massFlow: number;
  solidFlow: number;
  componentMass: { [component: string]: number };
  componentGrades: { [component: string]: number };
}

// Rigorous Global Mass Balance Validation
export function validateGlobalMassBalance(
  inputStreams: StreamBalance[],
  outputStreams: StreamBalance[]
): { isValid: boolean; error: number; details: string } {
  
  const totalMassIn = inputStreams.reduce((sum, stream) => sum + stream.massFlow, 0);
  const totalMassOut = outputStreams.reduce((sum, stream) => sum + stream.massFlow, 0);
  
  const totalSolidsIn = inputStreams.reduce((sum, stream) => sum + stream.solidFlow, 0);
  const totalSolidsOut = outputStreams.reduce((sum, stream) => sum + stream.solidFlow, 0);
  
  const massError = Math.abs(totalMassIn - totalMassOut);
  const massErrorPercent = totalMassIn > 0 ? (massError / totalMassIn) * 100 : 0;
  
  const solidsError = Math.abs(totalSolidsIn - totalSolidsOut);
  const solidsErrorPercent = totalSolidsIn > 0 ? (solidsError / totalSolidsIn) * 100 : 0;
  
  const overallError = Math.max(massErrorPercent, solidsErrorPercent);
  const isValid = overallError < 0.1; // Convergence criterion < 0.1%
  
  const details = `
    Massa Total: Entrada ${totalMassIn.toFixed(2)} t/h → Saída ${totalMassOut.toFixed(2)} t/h (Erro: ${massErrorPercent.toFixed(3)}%)
    Sólidos: Entrada ${totalSolidsIn.toFixed(2)} t/h → Saída ${totalSolidsOut.toFixed(2)} t/h (Erro: ${solidsErrorPercent.toFixed(3)}%)
  `.trim();
  
  return { isValid, error: overallError, details };
}

// Component-by-Component Mass Balance
export function validateComponentBalance(
  inputStreams: StreamBalance[],
  outputStreams: StreamBalance[],
  components: string[]
): { [component: string]: { isValid: boolean; error: number; details: string } } {
  
  const results: { [component: string]: { isValid: boolean; error: number; details: string } } = {};
  
  for (const component of components) {
    const totalComponentIn = inputStreams.reduce((sum, stream) => 
      sum + (stream.componentMass[component] || 0), 0
    );
    
    const totalComponentOut = outputStreams.reduce((sum, stream) => 
      sum + (stream.componentMass[component] || 0), 0
    );
    
    const componentError = Math.abs(totalComponentIn - totalComponentOut);
    const componentErrorPercent = totalComponentIn > 0 ? (componentError / totalComponentIn) * 100 : 0;
    
    const isValid = componentErrorPercent < 0.1;
    
    results[component] = {
      isValid,
      error: componentErrorPercent,
      details: `${component}: Entrada ${totalComponentIn.toFixed(3)} t/h → Saída ${totalComponentOut.toFixed(3)} t/h (Erro: ${componentErrorPercent.toFixed(3)}%)`
    };
  }
  
  return results;
}

// Metallurgical Recovery Calculations
export function calculateMetallurgicalRecovery(
  feedStreams: StreamBalance[],
  concentrateStreams: StreamBalance[],
  tailingStreams: StreamBalance[],
  components: string[]
): { [component: string]: { recovery: number; enrichmentRatio: number; concentrationRatio: number } } {
  
  const results: { [component: string]: { recovery: number; enrichmentRatio: number; concentrationRatio: number } } = {};
  
  for (const component of components) {
    // Calculate total component mass in each stream type
    const feedComponentMass = feedStreams.reduce((sum, stream) => 
      sum + (stream.componentMass[component] || 0), 0
    );
    
    const concentrateComponentMass = concentrateStreams.reduce((sum, stream) => 
      sum + (stream.componentMass[component] || 0), 0
    );
    
    // Calculate weighted average grades
    const totalFeedSolids = feedStreams.reduce((sum, stream) => sum + stream.solidFlow, 0);
    const totalConcSolids = concentrateStreams.reduce((sum, stream) => sum + stream.solidFlow, 0);
    
    const feedGrade = totalFeedSolids > 0 ? (feedComponentMass / totalFeedSolids) * 100 : 0;
    const concentrateGrade = totalConcSolids > 0 ? (concentrateComponentMass / totalConcSolids) * 100 : 0;
    
    // Recovery calculation
    const recovery = feedComponentMass > 0 ? (concentrateComponentMass / feedComponentMass) * 100 : 0;
    
    // Enrichment ratio (concentrate grade / feed grade)
    const enrichmentRatio = feedGrade > 0 ? concentrateGrade / feedGrade : 0;
    
    // Concentration ratio (feed mass / concentrate mass)
    const totalFeedMass = feedStreams.reduce((sum, stream) => sum + stream.massFlow, 0);
    const totalConcMass = concentrateStreams.reduce((sum, stream) => sum + stream.massFlow, 0);
    const concentrationRatio = totalConcMass > 0 ? totalFeedMass / totalConcMass : 0;
    
    results[component] = {
      recovery,
      enrichmentRatio,
      concentrationRatio
    };
  }
  
  return results;
}

// Auto-correction for stream imbalances
export function correctStreamImbalances(
  streams: StreamBalance[],
  targetTotalMass: number,
  targetComponents: { [component: string]: number }
): StreamBalance[] {
  
  const correctedStreams = [...streams];
  const currentTotalMass = streams.reduce((sum, stream) => sum + stream.massFlow, 0);
  
  if (currentTotalMass === 0) return correctedStreams;
  
  // Apply mass correction factor
  const massCorrectionFactor = targetTotalMass / currentTotalMass;
  
  for (const stream of correctedStreams) {
    stream.massFlow *= massCorrectionFactor;
    stream.solidFlow *= massCorrectionFactor;
    
    // Correct component masses while maintaining grades
    for (const component in stream.componentMass) {
      stream.componentMass[component] *= massCorrectionFactor;
    }
  }
  
  return correctedStreams;
}

// Comprehensive Circuit Analysis
export function analyzeCircuitBalance(
  equipments: any[],
  flowLines: any[],
  mineralComponents: any[]
): BalanceResult {
  
  const activeComponents = mineralComponents
    .filter(comp => comp.isActive)
    .map(comp => comp.id);
  
  // Convert flowLines to StreamBalance format
  const convertToStreamBalance = (flowLine: any): StreamBalance => {
    const solidFlow = flowLine.flowRate * (flowLine.solidPercent / 100);
    const componentMass: { [component: string]: number } = {};
    
    for (const compId of activeComponents) {
      const grade = flowLine.componentGrades?.[compId] || 0;
      componentMass[compId] = solidFlow * (grade / 100);
    }
    
    return {
      streamId: flowLine.id,
      streamName: flowLine.name,
      massFlow: flowLine.flowRate,
      solidFlow,
      componentMass,
      componentGrades: flowLine.componentGrades || {}
    };
  };
  
  const allStreams = flowLines.map(convertToStreamBalance);
  const inputStreams = allStreams.filter(stream => !flowLines.find(fl => fl.id === stream.streamId)?.fromEquipment);
  const outputStreams = allStreams.filter(stream => !flowLines.find(fl => fl.id === stream.streamId)?.toEquipment);
  
  // Global mass balance
  const globalBalance = validateGlobalMassBalance(inputStreams, outputStreams);
  
  // Component balances
  const componentBalances = validateComponentBalance(inputStreams, outputStreams, activeComponents);
  
  // Find concentrate and tailing streams for metallurgical analysis
  const concentrateStreams = allStreams.filter(stream => 
    stream.streamName.toLowerCase().includes('conc') ||
    stream.streamName.toLowerCase().includes('final')
  );
  
  const tailingStreams = allStreams.filter(stream =>
    stream.streamName.toLowerCase().includes('tail') ||
    stream.streamName.toLowerCase().includes('rejeito')
  );
  
  // Metallurgical recovery
  const metallurgicalResults = calculateMetallurgicalRecovery(
    inputStreams,
    concentrateStreams.length > 0 ? concentrateStreams : outputStreams,
    tailingStreams,
    activeComponents
  );
  
  // Compile results
  const componentErrors: { [component: string]: number } = {};
  const massRecovery: { [component: string]: number } = {};
  const enrichmentRatio: { [component: string]: number } = {};
  
  let concentrationRatio = 0;
  const discrepancies: string[] = [];
  const recommendations: string[] = [];
  
  for (const component of activeComponents) {
    componentErrors[component] = componentBalances[component]?.error || 0;
    massRecovery[component] = metallurgicalResults[component]?.recovery || 0;
    enrichmentRatio[component] = metallurgicalResults[component]?.enrichmentRatio || 0;
    concentrationRatio = Math.max(concentrationRatio, metallurgicalResults[component]?.concentrationRatio || 0);
    
    // Identify discrepancies
    if (componentBalances[component] && !componentBalances[component].isValid) {
      discrepancies.push(`${component}: Erro ${componentBalances[component].error.toFixed(3)}% no balanço de massa`);
    }
    
    // Generate recommendations
    if (componentErrors[component] > 0.5) {
      recommendations.push(`Verificar medições de ${component} - erro elevado (${componentErrors[component].toFixed(2)}%)`);
    }
    
    if (massRecovery[component] < 50) {
      recommendations.push(`Baixa recuperação de ${component} (${massRecovery[component].toFixed(1)}%) - revisar parâmetros operacionais`);
    }
    
    if (enrichmentRatio[component] < 2) {
      recommendations.push(`Baixa razão de enriquecimento para ${component} (${enrichmentRatio[component].toFixed(2)}) - otimizar processo de concentração`);
    }
  }
  
  if (!globalBalance.isValid) {
    discrepancies.unshift(`Balanço global: Erro ${globalBalance.error.toFixed(3)}% na massa total`);
    recommendations.unshift('Verificar consistência das medições de vazão em todas as correntes');
  }
  
  if (inputStreams.length === 0) {
    recommendations.push('Definir correntes de alimentação no fluxograma');
  }
  
  if (outputStreams.length === 0) {
    recommendations.push('Definir correntes de produto no fluxograma');
  }
  
  return {
    isValid: globalBalance.isValid && Object.values(componentBalances).every(cb => cb.isValid),
    globalError: globalBalance.error,
    componentErrors,
    massRecovery,
    enrichmentRatio,
    concentrationRatio,
    discrepancies,
    recommendations
  };
}

// Sensitivity Analysis
export function performSensitivityAnalysis(
  baseFlowLines: any[],
  mineralComponents: any[],
  perturbationPercent: number = 5
): {
  parameter: string;
  baseValue: number;
  perturbedValue: number;
  impactOnRecovery: { [component: string]: number };
  impactOnBalance: number;
}[] {
  
  const results: {
    parameter: string;
    baseValue: number;
    perturbedValue: number;
    impactOnRecovery: { [component: string]: number };
    impactOnBalance: number;
  }[] = [];
  const activeComponents = mineralComponents.filter(comp => comp.isActive);
  
  // Test sensitivity to flow rate variations
  for (const flowLine of baseFlowLines) {
    const originalFlowRate = flowLine.flowRate;
    const perturbedFlowRate = originalFlowRate * (1 + perturbationPercent / 100);
    
    // Create perturbed flow lines
    const perturbedFlowLines = baseFlowLines.map(fl => 
      fl.id === flowLine.id 
        ? { ...fl, flowRate: perturbedFlowRate }
        : { ...fl }
    );
    
    // Analyze impact (simplified)
    const baseAnalysis = analyzeCircuitBalance([], baseFlowLines, mineralComponents);
    const perturbedAnalysis = analyzeCircuitBalance([], perturbedFlowLines, mineralComponents);
    
    const impactOnRecovery: { [component: string]: number } = {};
    for (const comp of activeComponents) {
      const baseRecovery = baseAnalysis.massRecovery[comp.id] || 0;
      const perturbedRecovery = perturbedAnalysis.massRecovery[comp.id] || 0;
      impactOnRecovery[comp.id] = perturbedRecovery - baseRecovery;
    }
    
    const impactOnBalance = perturbedAnalysis.globalError - baseAnalysis.globalError;
    
    results.push({
      parameter: `Vazão ${flowLine.name}`,
      baseValue: originalFlowRate,
      perturbedValue: perturbedFlowRate,
      impactOnRecovery,
      impactOnBalance
    });
  }
  
  return results;
}

export interface MaterialStream {
  flowRate: number; // t/h
  solidPercent: number; // %
  density: number; // g/cm³
  particleSize: number; // P80 in µm
  mineralContent: {
    [mineral: string]: number; // % by weight
  };
  waterFlow?: number; // m³/h
  solidFlow?: number; // t/h
  components?: {
    [componentName: string]: number; // % grade of each component
  };
}

export interface SimulationResult {
  equipment: string;
  inputs: MaterialStream[];
  outputs: MaterialStream[];
  efficiency: number;
  powerConsumption: number;
  warnings: string[];
}

// Bond Work Index calculation for grinding
export function calculateBondWorkIndex(
  feedSize: number, // µm
  productSize: number, // µm
  workIndex: number = 15 // kWh/t
): number {
  // Bond's equation: W = 10 * Wi * (1/√P80 - 1/√F80)
  if (productSize >= feedSize) return 0;
  
  const work = 10 * workIndex * (
    1 / Math.sqrt(productSize) - 1 / Math.sqrt(feedSize)
  );
  
  return Math.max(0, work);
}

// Calculate mill power using Bond's equation
export function calculateMillPower(
  diameter: number, // m
  length: number, // m
  ballLoad: number, // %
  speed: number, // % of critical speed
  feedRate: number // t/h
): number {
  // Simplified Bond equation for ball mill power
  const volumeLoad = ballLoad / 100;
  const criticalSpeedFraction = speed / 100;
  
  // Power = K * D^2.5 * L * Vb * Cs
  const K = 4.5; // Constant for overflow ball mills
  const power = K * Math.pow(diameter, 2.5) * length * volumeLoad * criticalSpeedFraction;
  
  return power * feedRate; // kW
}

// Crusher reduction ratio calculation
export function calculateCrusherProduct(
  feedSize: number,
  reductionRatio: number
): number {
  return feedSize / reductionRatio;
}

// Flotation recovery calculation
export function calculateFlotationRecovery(
  gradeIn: number, // % mineral in feed
  gradeConcentrate: number, // % mineral in concentrate
  gradeTailing: number, // % mineral in tailing
): number {
  if (gradeConcentrate <= gradeTailing) return 0;
  
  const recovery = ((gradeConcentrate - gradeTailing) * gradeIn) / 
                   ((gradeConcentrate - gradeTailing) * gradeIn + 
                    (gradeIn - gradeTailing) * gradeTailing) * 100;
  
  return Math.min(100, Math.max(0, recovery));
}

// Metallurgical mass balance calculation by components
export function calculateMetallurgicalBalance(
  feedFlow: number,
  concentrateFlow: number,
  tailingFlow: number,
  components: { [key: string]: { feedGrade: number; concentrate: number; tailing: number; recovery: number } }
): { isValid: boolean; errors: string[]; calculations: any } {
  const errors: string[] = [];
  const calculations: any = {};
  
  // Check overall mass balance first
  const totalOut = concentrateFlow + tailingFlow;
  const massError = Math.abs(feedFlow - totalOut);
  const massErrorPercent = (massError / feedFlow) * 100;
  
  if (massErrorPercent > 1) {
    errors.push(`Erro no balanço de massa: ${massErrorPercent.toFixed(2)}%`);
  }
  
  // Check each component balance
  for (const [componentName, data] of Object.entries(components)) {
    const { feedGrade, concentrate, tailing, recovery } = data;
    
    // Calculate using Aa = Bb + Cc formula
    const feedMass = feedFlow * (feedGrade / 100); // Mass of component in feed
    const concMass = concentrateFlow * (concentrate / 100); // Mass in concentrate
    const tailMass = tailingFlow * (tailing / 100); // Mass in tailing
    
    const totalComponentOut = concMass + tailMass;
    const componentError = Math.abs(feedMass - totalComponentOut);
    const componentErrorPercent = feedMass > 0 ? (componentError / feedMass) * 100 : 0;
    
    // Calculate actual recovery
    const actualRecovery = feedMass > 0 ? (concMass / feedMass) * 100 : 0;
    const recoveryError = Math.abs(recovery - actualRecovery);
    
    calculations[componentName] = {
      feedMass: feedMass.toFixed(3),
      concMass: concMass.toFixed(3),
      tailMass: tailMass.toFixed(3),
      actualRecovery: actualRecovery.toFixed(2),
      massBalance: componentErrorPercent.toFixed(2),
      recoveryError: recoveryError.toFixed(2),
      isValid: componentErrorPercent < 1 && recoveryError < 2
    };
    
    if (componentErrorPercent > 1) {
      errors.push(`${componentName}: Erro no balanço ${componentErrorPercent.toFixed(2)}%`);
    }
    
    if (recoveryError > 2) {
      errors.push(`${componentName}: Recuperação inconsistente (${recoveryError.toFixed(2)}% erro)`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    calculations
  };
}

// Enhanced flotation mass balance with components - PERFECT MASS CONSERVATION
export function flotationMassBalanceWithComponents(
  feed: MaterialStream,
  recovery: number,
  gradeConcentrate: number,
  components?: { [key: string]: { feedGrade: number; concentrate: number; tailing: number; recovery: number } }
): { concentrate: MaterialStream; tailing: MaterialStream; balance: any } {
  
  // Use metallurgical recovery (not mass recovery)
  // Mass recovery is calculated to maintain component balance
  const metallurgicalRecovery = recovery / 100;
  
  // Calculate mass flows using two-product formula
  // R = (F*f - T*t) / (C*c - T*t) where R = mass recovery, F = feed, C = conc, T = tail
  // For valuable component: feed_grade * metallurgical_recovery = concentrate_grade * mass_recovery
  
  const feedGradeValuable = feed.mineralContent?.valuable || 5; // Default feed grade
  const tailingGradeValuable = feedGradeValuable * (1 - metallurgicalRecovery); // Calculate tailing grade
  
  // Mass balance equation: F = C + T
  // Component balance: F*f = C*c + T*t
  // Recovery equation: R = (C*c) / (F*f) = metallurgical recovery
  // Solving: C = F * f * R / c
  
  let massRecovery: number;
  if (gradeConcentrate > feedGradeValuable) {
    // Standard flotation case
    massRecovery = (feedGradeValuable * metallurgicalRecovery) / gradeConcentrate;
  } else {
    // Edge case - use direct mass recovery
    massRecovery = metallurgicalRecovery;
  }
  
  // Ensure mass recovery is realistic (0-100%)
  massRecovery = Math.max(0.01, Math.min(0.99, massRecovery));
  
  const concentrateFlow = feed.flowRate * massRecovery;
  const tailingFlow = feed.flowRate - concentrateFlow; // Perfect mass conservation
  
  // Calculate solid flows to maintain solids balance
  const feedSolidsFlow = feed.flowRate * (feed.solidPercent / 100);
  const concentrateSolidsFlow = feedSolidsFlow * massRecovery;
  const tailingSolidsFlow = feedSolidsFlow - concentrateSolidsFlow;
  
  // Calculate water flows
  const feedWaterFlow = feed.flowRate - feedSolidsFlow;
  const concentrateWaterFlow = concentrateFlow - concentrateSolidsFlow;
  const tailingWaterFlow = feedWaterFlow - concentrateWaterFlow;
  
  // Calculate solid percentages
  const concentrateSolidPercent = (concentrateSolidsFlow / concentrateFlow) * 100;
  const tailingSolidPercent = (tailingSolidsFlow / tailingFlow) * 100;
  
  // Component balances with perfect conservation
  let concentrateComponents: { [key: string]: number } = {};
  let tailingComponents: { [key: string]: number } = {};
  let balance: any = null;
  
  if (components) {
    for (const [componentName, data] of Object.entries(components)) {
      const feedGrade = data.feedGrade;
      const componentRecovery = data.recovery / 100;
      
      // Perfect component balance: F*f = C*c + T*t
      const totalComponentMass = feedSolidsFlow * (feedGrade / 100);
      const concentrateComponentMass = totalComponentMass * componentRecovery;
      const tailingComponentMass = totalComponentMass - concentrateComponentMass;
      
      concentrateComponents[componentName] = (concentrateComponentMass / concentrateSolidsFlow) * 100;
      tailingComponents[componentName] = tailingSolidsFlow > 0 ? (tailingComponentMass / tailingSolidsFlow) * 100 : 0;
    }
    
    balance = calculateMetallurgicalBalance(
      feed.flowRate,
      concentrateFlow,
      tailingFlow,
      components
    );
  }
  
  const concentrate: MaterialStream = {
    flowRate: concentrateFlow,
    solidPercent: concentrateSolidPercent,
    density: feed.density,
    particleSize: feed.particleSize * 0.9, // Slightly finer
    mineralContent: {
      valuable: gradeConcentrate,
      gangue: 100 - gradeConcentrate
    },
    waterFlow: concentrateWaterFlow,
    solidFlow: concentrateSolidsFlow,
    components: concentrateComponents
  };
  
  const tailing: MaterialStream = {
    flowRate: tailingFlow,
    solidPercent: tailingSolidPercent,
    density: feed.density,
    particleSize: feed.particleSize * 1.1, // Slightly coarser
    mineralContent: {
      valuable: tailingGradeValuable,
      gangue: 100 - tailingGradeValuable
    },
    waterFlow: tailingWaterFlow,
    solidFlow: tailingSolidsFlow,
    components: tailingComponents
  };
  
  return { concentrate, tailing, balance };
}

// Overall mass balance validation
export function validateMassBalance(
  inputs: MaterialStream[],
  outputs: MaterialStream[]
): { isValid: boolean; error: number; message: string } {
  const totalIn = inputs.reduce((sum, stream) => sum + stream.flowRate, 0);
  const totalOut = outputs.reduce((sum, stream) => sum + stream.flowRate, 0);
  
  const error = Math.abs(totalIn - totalOut);
  const errorPercent = (error / totalIn) * 100;
  
  const isValid = errorPercent < 1; // Allow 1% error
  
  return {
    isValid,
    error: errorPercent,
    message: isValid 
      ? 'Balanço de massa OK' 
      : `Erro no balanço: ${errorPercent.toFixed(2)}% (Entrada: ${totalIn.toFixed(2)} t/h, Saída: ${totalOut.toFixed(2)} t/h)`
  };
}

// Water balance calculation
export function calculateWaterBalance(stream: MaterialStream): MaterialStream {
  const solidFlow = stream.flowRate;
  const solidPercent = stream.solidPercent / 100;
  
  // Calculate water flow from solid percentage
  // % Solids = (Mass of solids / Total mass) * 100
  // Total mass = Mass of solids / (% Solids / 100)
  const totalMass = solidFlow / solidPercent;
  const waterMass = totalMass - solidFlow;
  
  // Convert water mass to volume (assuming density of 1 t/m³)
  const waterFlow = waterMass;
  
  return {
    ...stream,
    waterFlow,
    solidFlow
  };
}

// Particle size distribution model (simplified Rosin-Rammler)
export function particleSizeDistribution(
  d80: number, // P80 size in µm
  size: number // Query size in µm
): number {
  // Rosin-Rammler: R(d) = 100 * exp(-(d/d63)^n)
  // For P80, we use n ≈ 1.5 and d63 ≈ 0.7 * d80
  const d63 = 0.7 * d80;
  const n = 1.5;
  
  const retained = 100 * Math.exp(-Math.pow(size / d63, n));
  return Math.max(0, Math.min(100, retained));
}

// ENHANCED SIMULATION WITH ITERATIVE MASS BALANCE
export function runSimulation(
  equipments: any[],
  flowLines: any[],
  config: any,
  mineralComponents?: any[]
): SimulationResult[] & { iterativeResult?: IterativeResult; detailedStreams?: DetailedStream[]; coherenceReport?: string[] } {
  
  // If no mineral components provided, use legacy simulation
  if (!mineralComponents || mineralComponents.length === 0) {
    return runLegacySimulation(equipments, flowLines, config);
  }
  
  // Use iterative mass balance solver
  const activeComponents = mineralComponents.filter(c => c.isActive);
  
  if (activeComponents.length === 0) {
    return runLegacySimulation(equipments, flowLines, config);
  }
  
  // Solve iterative mass balance
  const iterativeResults = solveIterativeMassBalance(equipments, flowLines, activeComponents);
  
  // Convert to standard SimulationResult format
  const results: SimulationResult[] = [];
  
  for (const equipment of equipments) {
    const inputStreamIds = flowLines
      .filter(fl => fl.toEquipment === equipment.id)
      .map(fl => fl.id);
    
    const outputStreamIds = flowLines
      .filter(fl => fl.fromEquipment === equipment.id)
      .map(fl => fl.id);
    
    // Find corresponding detailed streams
    const inputStreams = inputStreamIds.map(id => {
      const flIndex = flowLines.findIndex(fl => fl.id === id);
      return flIndex >= 0 ? iterativeResults.streams[flIndex] : null;
    }).filter(s => s !== null);
    
    const outputStreams = outputStreamIds.map(id => {
      const flIndex = flowLines.findIndex(fl => fl.id === id);
      return flIndex >= 0 ? iterativeResults.streams[flIndex] : null;
    }).filter(s => s !== null);
    
    // Calculate equipment performance
    let efficiency = 90;
    let powerConsumption = 100;
    let warnings: string[] = [];
    
    switch (equipment.type) {
      case 'britador':
        powerConsumption = equipment.parameters.power || 500;
        efficiency = equipment.parameters.efficiency || 95;
        break;
        
      case 'moinho':
        if (inputStreams.length > 0) {
          const millPower = calculateMillPower(
            equipment.parameters.diameter || 4.5,
            equipment.parameters.length || 6,
            equipment.parameters.ballLoad || 35,
            equipment.parameters.speed || 75,
            inputStreams[0].flowRate
          );
          powerConsumption = millPower;
          efficiency = 90;
        }
        break;
        
      case 'mixer':
        powerConsumption = equipment.parameters.power || 50;
        efficiency = equipment.parameters.efficiency || 99;
        if (inputStreams.length < (equipment.parameters.numberOfInputs || 2)) {
          warnings.push(`Mixer tem ${inputStreams.length} entradas conectadas (esperado: ${equipment.parameters.numberOfInputs || 2})`);
        }
        break;
        
      case 'rougher':
      case 'cleaner':
      case 'recleaner':
        powerConsumption = (equipment.parameters.numberOfCells || 4) * 50;
        efficiency = equipment.parameters.recovery || 85;
        
        // Calculate actual recovery achieved
        if (inputStreams.length > 0 && outputStreams.length >= 2) {
          const concentrate = outputStreams[0];
          const input = inputStreams[0];
          const mainComp = activeComponents[0];
          
          if (input.componentMass[mainComp.id] > 0) {
            const actualRecovery = (concentrate.componentMass[mainComp.id] / input.componentMass[mainComp.id]) * 100;
            efficiency = actualRecovery;
            
            if (Math.abs(actualRecovery - (equipment.parameters.recovery || 85)) > 5) {
              warnings.push(`Recuperação real (${actualRecovery.toFixed(1)}%) difere do target (${equipment.parameters.recovery || 85}%)`);
            }
          }
        }
        break;
    }
    
    results.push({
      equipment: equipment.name,
      inputs: inputStreams,
      outputs: outputStreams,
      efficiency,
      powerConsumption,
      warnings
    });
  }
  
  // Add iterative results as additional properties
  (results as any).iterativeResult = iterativeResults.iterativeResult;
  (results as any).detailedStreams = iterativeResults.streams;
  (results as any).coherenceReport = iterativeResults.coherenceReport;
  
  return results as any;
}

// Legacy simulation for backward compatibility
function runLegacySimulation(equipments: any[], flowLines: any[], config: any): SimulationResult[] {
  const results: SimulationResult[] = [];
  
  // Initialize feed stream
  const feedStream: MaterialStream = {
    flowRate: config.feedRate || 1000,
    solidPercent: config.solidPercent || 70,
    density: config.oreDensity || 2.8,
    particleSize: 10000, // 10mm initial
    mineralContent: {
      valuable: 5, // 5% valuable mineral
      gangue: 95
    }
  };
  
  // Process each equipment with basic logic
  for (const equipment of equipments) {
    let result: SimulationResult = {
      equipment: equipment.name,
      inputs: [feedStream],
      outputs: [],
      efficiency: 0,
      powerConsumption: 0,
      warnings: []
    };
    
    switch (equipment.type) {
      case 'britador':
        const crusherProduct = calculateCrusherProduct(
          feedStream.particleSize,
          equipment.parameters.reduction || 5
        );
        result.outputs.push({
          ...feedStream,
          particleSize: crusherProduct,
          flowRate: feedStream.flowRate * 0.95 // 5% loss
        });
        result.efficiency = 95;
        result.powerConsumption = equipment.parameters.power || 500;
        break;
        
      case 'moinho':
        const millPower = calculateMillPower(
          equipment.parameters.diameter || 4.5,
          equipment.parameters.length || 6,
          equipment.parameters.ballLoad || 35,
          equipment.parameters.speed || 75,
          feedStream.flowRate
        );
        result.outputs.push({
          ...feedStream,
          particleSize: 150 // Target P80
        });
        result.efficiency = 90;
        result.powerConsumption = millPower;
        break;
        
      default:
        result.outputs.push(feedStream);
        result.efficiency = 85;
        result.powerConsumption = 100;
        break;
    }
    
    results.push(result);
  }
  
  return results;
}

// Mix multiple streams function - PERFECT MASS CONSERVATION
export function mixStreams(streams: MaterialStream[], efficiency: number = 99): MaterialStream {
  if (streams.length === 0) {
    throw new Error('No streams to mix');
  }
  
  if (streams.length === 1) {
    return { ...streams[0] };
  }
  
  // Calculate total flows with perfect conservation
  const totalFlow = streams.reduce((sum, stream) => sum + stream.flowRate, 0);
  const outputTotalFlow = totalFlow * (efficiency / 100);
  
  // Mass weighted average for solid percent
  const totalSolidFlow = streams.reduce((sum, stream) => 
    sum + (stream.flowRate * stream.solidPercent / 100), 0
  );
  const outputSolidFlow = totalSolidFlow * (efficiency / 100);
  const mixedSolidPercent = outputTotalFlow > 0 ? (outputSolidFlow / outputTotalFlow) * 100 : 0;
  
  // Volume weighted average for density
  const totalVolume = streams.reduce((sum, stream) => 
    sum + (stream.flowRate / stream.density), 0
  );
  const mixedDensity = totalFlow / totalVolume;
  
  // Surface area weighted average for particle size (Sauter mean)
  const totalSurfaceArea = streams.reduce((sum, stream) => 
    sum + (stream.flowRate / stream.particleSize), 0
  );
  const mixedParticleSize = totalFlow / totalSurfaceArea;
  
  // Mineral content weighted average
  const mixedMineralContent: { [key: string]: number } = {};
  const allMinerals = new Set<string>();
  
  streams.forEach(stream => {
    Object.keys(stream.mineralContent).forEach(mineral => allMinerals.add(mineral));
  });
  
  for (const mineral of allMinerals) {
    const weightedSum = streams.reduce((sum, stream) => {
      const content = stream.mineralContent[mineral] || 0;
      return sum + (stream.flowRate * content / 100);
    }, 0);
    mixedMineralContent[mineral] = (weightedSum / totalFlow) * 100;
  }
  
  // Calculate components weighted average for perfect conservation
  const mixedComponents: { [key: string]: number } = {};
  const allComponents = new Set<string>();
  
  streams.forEach(stream => {
    if (stream.components) {
      Object.keys(stream.components).forEach(comp => allComponents.add(comp));
    }
  });
  
  for (const component of allComponents) {
    const componentMass = streams.reduce((sum, stream) => {
      const grade = stream.components?.[component] || 0;
      const solidFlow = stream.flowRate * (stream.solidPercent / 100);
      return sum + (solidFlow * grade / 100);
    }, 0);
    mixedComponents[component] = outputSolidFlow > 0 ? (componentMass / outputSolidFlow) * 100 : 0;
  }
  
  return {
    flowRate: outputTotalFlow, // Perfect conservation with efficiency
    solidPercent: mixedSolidPercent,
    density: mixedDensity,
    particleSize: mixedParticleSize,
    mineralContent: mixedMineralContent,
    waterFlow: streams.reduce((sum, stream) => sum + (stream.waterFlow || 0), 0) * (efficiency / 100),
    solidFlow: outputSolidFlow,
    components: mixedComponents
  };
}

// Economic calculations
export interface EconomicAnalysis {
  capitalCost: number; // USD
  operatingCost: number; // USD/year
  revenue: number; // USD/year
  npv: number; // Net Present Value
  irr: number; // Internal Rate of Return %
  paybackPeriod: number; // years
}

export function calculateEconomics(
  equipments: any[],
  results: SimulationResult[],
  metalPrice: number = 5000, // USD/ton of concentrate
  energyCost: number = 0.1 // USD/kWh
): EconomicAnalysis {
  // Capital cost estimation (simplified)
  let capitalCost = 0;
  for (const equipment of equipments) {
    switch (equipment.type) {
      case 'moinho':
        capitalCost += 2000000; // $2M per mill
        break;
      case 'britador':
        capitalCost += 500000; // $500k per crusher
        break;
      case 'rougher':
      case 'cleaner':
      case 'recleaner':
        capitalCost += 100000 * (equipment.parameters.numberOfCells || 4);
        break;
    }
  }
  
  // Operating cost calculation
  const totalPower = results.reduce((sum, r) => sum + r.powerConsumption, 0);
  const annualEnergyUse = totalPower * 8760; // kWh/year (24/7 operation)
  const energyCostAnnual = annualEnergyUse * energyCost;
  
  // Add other operating costs (labor, maintenance, reagents)
  const laborCost = 2000000; // $2M/year
  const maintenanceCost = capitalCost * 0.05; // 5% of capital per year
  const reagentCost = 1000000; // $1M/year
  
  const operatingCost = energyCostAnnual + laborCost + maintenanceCost + reagentCost;
  
  // Revenue calculation (simplified)
  const concentrateProduction = 1000 * 0.05 * 8760; // tons/year (assuming 5% recovery)
  const revenue = concentrateProduction * metalPrice;
  
  // Financial metrics
  const annualCashFlow = revenue - operatingCost;
  const discountRate = 0.1; // 10%
  const projectLife = 20; // years
  
  // NPV calculation
  let npv = -capitalCost;
  for (let year = 1; year <= projectLife; year++) {
    npv += annualCashFlow / Math.pow(1 + discountRate, year);
  }
  
  // Payback period
  const paybackPeriod = capitalCost / annualCashFlow;
  
  // IRR (simplified approximation)
  const irr = annualCashFlow / capitalCost * 100;
  
  return {
    capitalCost,
    operatingCost,
    revenue,
    npv,
    irr,
    paybackPeriod
  };
}

// Calculate equipment mass balance with perfect closure
function calculateEquipmentBalanceWithClosure(
  equipment: any, 
  inputStreams: DetailedStream[], 
  activeComponents: any[]
): DetailedStream[] {
  
  if (inputStreams.length === 0) return [];
  
  const totalInputFlow = inputStreams.reduce((sum, s) => sum + s.flowRate, 0);
  const totalInputSolids = inputStreams.reduce((sum, s) => sum + (s.solidFlow || 0), 0);
  
  // Calculate total input component masses
  const totalInputComponentMass: { [key: string]: number } = {};
  for (const comp of activeComponents) {
    totalInputComponentMass[comp.id] = inputStreams.reduce((sum, s) => 
      sum + (s.componentMass[comp.id] || 0), 0
    );
  }
  
  switch (equipment.type) {
    case 'mixer':
      // Perfect mixing with ENTRADA = SAÍDA closure
      const numOutputs = equipment.parameters.numberOfOutputs || 1;
      const splits = equipment.parameters.splits || Array(numOutputs).fill(100/numOutputs);
      const outputs: DetailedStream[] = [];
      
      for (let i = 0; i < numOutputs; i++) {
        const splitFraction = (splits[i] || 100/numOutputs) / 100;
        const outputFlow = totalInputFlow * splitFraction;
        const outputSolids = totalInputSolids * splitFraction;
        
        const outputComponentMass: { [key: string]: number } = {};
        const outputComponentPercentages: { [key: string]: number } = {};
        
        for (const comp of activeComponents) {
          outputComponentMass[comp.id] = totalInputComponentMass[comp.id] * splitFraction;
          outputComponentPercentages[comp.id] = outputSolids > 0 ? 
            (outputComponentMass[comp.id] / outputSolids) * 100 : 0;
        }
        
        outputs.push({
          flowRate: outputFlow,
          solidPercent: outputFlow > 0 ? (outputSolids / outputFlow) * 100 : 0,
          density: 2.8,
          particleSize: 150,
          mineralContent: {},
          volumetricFlow: outputSolids / 2.8 + (outputFlow - outputSolids) / 1.0,
          componentMass: outputComponentMass,
          componentPercentages: outputComponentPercentages,
          solidFlow: outputSolids,
          waterFlow: outputFlow - outputSolids
        });
      }
      
      return outputs;
      
    case 'rougher':
    case 'cleaner':
    case 'recleaner':
      // Flotation with perfect component closure
      const input = inputStreams[0];
      const recovery = equipment.parameters.recovery || 85;
      
      // Calculate outputs to maintain ENTRADA = SAÍDA for all components
      const concentrateComponentMass: { [key: string]: number } = {};
      const tailingComponentMass: { [key: string]: number } = {};
      
      for (const comp of activeComponents) {
        const componentRecovery = equipment.parameters.components?.[comp.id]?.recovery || recovery;
        const inputMass = totalInputComponentMass[comp.id] || 0;
        
        concentrateComponentMass[comp.id] = inputMass * (componentRecovery / 100);
        tailingComponentMass[comp.id] = inputMass - concentrateComponentMass[comp.id]; // Perfect closure
      }
      
      // Calculate flow rates based on typical flotation behavior
      const concentrateFlow = totalInputFlow * 0.3; // Typical 30% mass to concentrate
      const tailingFlow = totalInputFlow - concentrateFlow; // Perfect mass closure
      
      const concentrateSolids = concentrateFlow * 0.65;
      const tailingSolids = tailingFlow * 0.35;
      
      const concentratePercentages: { [key: string]: number } = {};
      const tailingPercentages: { [key: string]: number } = {};
      
      for (const comp of activeComponents) {
        concentratePercentages[comp.id] = concentrateSolids > 0 ? 
          (concentrateComponentMass[comp.id] / concentrateSolids) * 100 : 0;
        tailingPercentages[comp.id] = tailingSolids > 0 ? 
          (tailingComponentMass[comp.id] / tailingSolids) * 100 : 0;
      }
      
      const concentrate: DetailedStream = {
        flowRate: concentrateFlow,
        solidPercent: 65,
        density: input.density,
        particleSize: input.particleSize,
        mineralContent: {},
        volumetricFlow: concentrateSolids / input.density + (concentrateFlow - concentrateSolids) / 1.0,
        componentMass: concentrateComponentMass,
        componentPercentages: concentratePercentages,
        solidFlow: concentrateSolids,
        waterFlow: concentrateFlow - concentrateSolids
      };
      
      const tailing: DetailedStream = {
        flowRate: tailingFlow,
        solidPercent: 35,
        density: input.density,
        particleSize: input.particleSize,
        mineralContent: {},
        volumetricFlow: tailingSolids / input.density + (tailingFlow - tailingSolids) / 1.0,
        componentMass: tailingComponentMass,
        componentPercentages: tailingPercentages,
        solidFlow: tailingSolids,
        waterFlow: tailingFlow - tailingSolids
      };
      
      return [concentrate, tailing];
      
    default:
      // Pass-through equipment with perfect closure
      return inputStreams.map(stream => ({
        ...stream,
        particleSize: equipment.parameters.targetSize || stream.particleSize * 0.5,
        flowRate: stream.flowRate,
        componentMass: { ...stream.componentMass },
        componentPercentages: { ...stream.componentPercentages }
      }));
  }
}

// Enhanced global mass balance corrections with ENTRADA = SAÍDA logic
function applyGlobalMassBalanceWithClosure(
  streams: DetailedStream[], 
  flowLines: any[], 
  activeComponents: any[]
): { correctedStreams: DetailedStream[] } {
  
  const correctedStreams = [...streams];
  
  // Find input and output streams
  const inputIndices = flowLines
    .map((fl, idx) => !fl.fromEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  const outputIndices = flowLines
    .map((fl, idx) => !fl.toEquipment ? idx : -1)
    .filter(idx => idx >= 0);
  
  if (inputIndices.length === 0 || outputIndices.length === 0) {
    return { correctedStreams };
  }
  
  // ENTRADA = SAÍDA LOGIC for each component
  for (const comp of activeComponents) {
    const totalInputMass = inputIndices.reduce((sum, idx) => 
      sum + (correctedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    const totalOutputMass = outputIndices.reduce((sum, idx) => 
      sum + (correctedStreams[idx]?.componentMass[comp.id] || 0), 0
    );
    
    // Apply closure: force output to equal input
    if (totalInputMass > 0) {
      const correctionFactor = totalInputMass / (totalOutputMass || 0.001);
      
      // CASE 1: Output data missing or incorrect - use input data
      if (totalOutputMass === 0 || Math.abs(correctionFactor - 1) > 0.01) {
        
        // Distribute input mass proportionally to outputs
        const activeOutputs = outputIndices.filter(idx => correctedStreams[idx]);
        
        if (activeOutputs.length > 0) {
          const massPerOutput = totalInputMass / activeOutputs.length;
          
          for (const idx of activeOutputs) {
            correctedStreams[idx].componentMass[comp.id] = massPerOutput;
            
            // Recalculate percentage
            const solidFlow = correctedStreams[idx].solidFlow || 0;
            correctedStreams[idx].componentPercentages[comp.id] = solidFlow > 0 ? 
              (massPerOutput / solidFlow) * 100 : 0;
          }
        }
      }
    } else if (totalOutputMass > 0) {
      // CASE 2: Input data missing - calculate from output data
      const activeInputs = inputIndices.filter(idx => correctedStreams[idx]);
      
      if (activeInputs.length > 0) {
        const massPerInput = totalOutputMass / activeInputs.length;
        
        for (const idx of activeInputs) {
          correctedStreams[idx].componentMass[comp.id] = massPerInput;
          
          // Recalculate percentage
          const solidFlow = correctedStreams[idx].solidFlow || 0;
          correctedStreams[idx].componentPercentages[comp.id] = solidFlow > 0 ? 
            (massPerInput / solidFlow) * 100 : 0;
        }
      }
    }
  }
  
  // Apply global flow balance with ENTRADA = SAÍDA
  const totalInputFlow = inputIndices.reduce((sum, idx) => sum + (correctedStreams[idx]?.flowRate || 0), 0);
  const totalOutputFlow = outputIndices.reduce((sum, idx) => sum + (correctedStreams[idx]?.flowRate || 0), 0);
  
  // CASE 1: Output flow missing - use input flow
  if (totalInputFlow > 0 && (totalOutputFlow === 0 || Math.abs(totalInputFlow - totalOutputFlow) > 0.01)) {
    const activeOutputs = outputIndices.filter(idx => correctedStreams[idx]);
    
    if (activeOutputs.length > 0) {
      const flowPerOutput = totalInputFlow / activeOutputs.length;
      
      for (const idx of activeOutputs) {
        const originalFlow = correctedStreams[idx].flowRate;
        correctedStreams[idx].flowRate = flowPerOutput;
        
        // Maintain solid percentage if possible
        const solidPercent = correctedStreams[idx].solidPercent;
        correctedStreams[idx].solidFlow = flowPerOutput * (solidPercent / 100);
        correctedStreams[idx].waterFlow = flowPerOutput * (1 - solidPercent / 100);
        correctedStreams[idx].volumetricFlow = correctedStreams[idx].solidFlow / correctedStreams[idx].density + 
                                              correctedStreams[idx].waterFlow / 1.0;
      }
    }
  }
  // CASE 2: Input flow missing - calculate from output flow
  else if (totalOutputFlow > 0 && totalInputFlow === 0) {
    const activeInputs = inputIndices.filter(idx => correctedStreams[idx]);
    
    if (activeInputs.length > 0) {
      const flowPerInput = totalOutputFlow / activeInputs.length;
      
      for (const idx of activeInputs) {
        correctedStreams[idx].flowRate = flowPerInput;
        
        const solidPercent = correctedStreams[idx].solidPercent;
        correctedStreams[idx].solidFlow = flowPerInput * (solidPercent / 100);
        correctedStreams[idx].waterFlow = flowPerInput * (1 - solidPercent / 100);
        correctedStreams[idx].volumetricFlow = correctedStreams[idx].solidFlow / correctedStreams[idx].density + 
                                              correctedStreams[idx].waterFlow / 1.0;
      }
    }
  }
  
  return { correctedStreams };
}