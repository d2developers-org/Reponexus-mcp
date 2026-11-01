import { Activation, QueryInput, SAGEGraph, SignalSource } from '../types';

export interface SignalCollector {
  readonly source: SignalSource;
  collect(input: QueryInput, graph: SAGEGraph): Activation[];
}

