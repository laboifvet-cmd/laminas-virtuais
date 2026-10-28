# Skills do Claude neste projeto

Instruções que o Claude Code carrega sozinho quando a tarefa pede (inclusive nas sessões na nuvem).
Copiadas dos repositórios oficiais, sem alteração. Não têm scripts: só texto e exemplos.

| Skill | Para que serve | Origem (repositório@versão) |
| --- | --- | --- |
| `web-design-guidelines` | revisão de interface: acessibilidade, usabilidade e boas práticas de design (Vercel; busca as regras atualizadas no GitHub da Vercel a cada revisão) | [vercel-labs/agent-skills@1a2c79d](https://github.com/vercel-labs/agent-skills) |

## Atualizar

Peça ao Claude: "atualiza as skills de .claude/skills a partir dos repositórios oficiais". Ele baixa a versão nova, confere o que mudou e substitui as pastas.
Licença: MIT (Vercel e Supabase). Mantenha poucas skills: cada uma a mais pesa na leitura do Claude.
