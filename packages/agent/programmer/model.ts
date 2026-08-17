import { ChatOpenAI } from '@langchain/openai';

export function createChatModel() {
  return new ChatOpenAI({
    model: 'gpt-5-mini',
    
  });
}
