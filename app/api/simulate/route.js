import { personas } from '../../lib/personas';

export const runtime = 'edge';

export async function POST(req) {
  const { question, githubToken } = await req.json();
  const token = githubToken || process.env.GITHUB_TOKEN;

  if (!question) {
    return new Response(JSON.stringify({ error: 'Question is required' }), { status: 400 });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'GitHub Token is required' }), { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fire 12 parallel requests using GitHub Models API
        const promises = personas.map(async (persona) => {
          try {
            const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                model: 'Meta-Llama-3.1-8B-Instruct', // Open source model available on GitHub Models
                stream: true,
                messages: [
                  { role: 'system', content: persona.system_prompt },
                  { 
                    role: 'user', 
                    content: `${question}\n\nRespond in 4-5 sentences in your own voice and worldview. End with one line: VERDICT: BULLISH / CAUTIOUS / SKEPTICAL / NEUTRAL and one line: KEY CONCERN: [one sentence]` 
                  }
                ]
              })
            });

            if (!res.ok) {
              const errText = await res.text();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', id: persona.id, message: `API Error: ${res.status}` })}\n\n`));
              return null;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n').filter(Boolean);
              
              for (const line of lines) {
                if (line.trim() === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                  try {
                    const parsed = JSON.parse(line.slice(6));
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      fullResponse += content;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', id: persona.id, content: content })}\n\n`));
                    }
                  } catch(e) {}
                }
              }
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', id: persona.id, fullResponse })}\n\n`));
            return { persona, response: fullResponse };
            
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', id: persona.id, message: err.message })}\n\n`));
            return null;
          }
        });

        const completedResponses = await Promise.all(promises);

        // All 12 finished, fire synthesis call
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'synthesis_start' })}\n\n`));
        
        const validResponses = completedResponses.filter(r => r !== null);
        const synthesisPrompt = validResponses.map(r => `[${r.persona.name} - ${r.persona.role}]: ${r.response}`).join('\n\n');

        const synthesisRes = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            model: 'Meta-Llama-3.1-8B-Instruct',
            stream: true,
            messages: [
              { 
                role: 'system', 
                content: `You are the Synthesis Agent. Review the panel responses.
Output ONLY the following format:
MAJORITY VIEW: [1-2 sentences]
MINORITY VIEW: [1-2 sentences]
BIGGEST RISK: [1 sentence]
RECOMMENDATION: [1 sentence]` 
              },
              { role: 'user', content: `Analyze these responses to: "${question}"\n\n${synthesisPrompt}` }
            ]
          })
        });

        if (synthesisRes.ok) {
          const sReader = synthesisRes.body.getReader();
          const sDecoder = new TextDecoder();
          let synthesisFull = '';

          while (true) {
            const { done, value } = await sReader.read();
            if (done) break;
            const chunk = sDecoder.decode(value);
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
              if (line.trim() === 'data: [DONE]') continue;
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    synthesisFull += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'synthesis_chunk', content: content })}\n\n`));
                  }
                } catch(e) {}
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'synthesis_done', fullResponse: synthesisFull })}\n\n`));
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'global_error', message: err.message })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
