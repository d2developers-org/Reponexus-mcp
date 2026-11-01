import { Activation, QueryInput, SAGEGraph, SignalSource } from '../types';
import { SignalCollector } from './SignalCollector';

export class SessionSignal implements SignalCollector {
  public readonly source: SignalSource = 'session';

  public collect(input: QueryInput, graph: SAGEGraph): Activation[] {
    const activations: Activation[] = [];
    if (!input.sessionHistory || input.sessionHistory.length === 0) {
      return activations;
    }

    const validNodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const prevId of input.sessionHistory) {
      if (validNodeIds.has(prevId)) {
        activations.push({
          nodeId: prevId,
          score: 0.30,
          source: this.source,
          reason: `Previous session conversation history: ${prevId}`,
        });
      }
    }

    return activations;
  }
}

