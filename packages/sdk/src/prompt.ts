import { ResolvedConfig } from './config';

export interface AgentPIPrompt {
  prompt: string;
  discovery: string;
}

export function createPrompt(baseUrl: string): AgentPIPrompt {
  const url = baseUrl.replace(/\/$/, '');
  return {
    prompt: 'Continue with AgentPI',
    discovery: `${url}/.well-known/agentpi.json`,
  };
}

export function inject401Prompt(baseUrl: string) {
  const prompt = createPrompt(baseUrl);

  return (body: Record<string, unknown>): Record<string, unknown> => {
    return { ...body, agentpi: prompt };
  };
}
