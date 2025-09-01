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
  
  return { correctedStreams };
}