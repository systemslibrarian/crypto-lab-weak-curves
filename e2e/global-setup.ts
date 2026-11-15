import { resetSink } from './observations';

/** Clear the observation sink so a file left by an earlier run cannot answer this run's coverage question. */
export default async function globalSetup(): Promise<void> {
  resetSink();
}
