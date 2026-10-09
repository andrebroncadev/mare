# Maré

Sistema independente para gestão de imóveis de temporada: catálogo, preços por diária e pacote, importação revisável e montagem de ofertas.

## Stack
- Vite + JavaScript para a interface responsiva.
- Vercel para hospedagem e deploy a partir do GitHub.
- Supabase Auth + PostgreSQL com Row Level Security.
- Cloudinary para fotos (integração de upload na próxima etapa).

## Estado atual
A base da interface está preparada. O modo de configuração aparece até conectar um projeto Supabase exclusivo do Maré. Não conecte este app ao banco de outro sistema.

## Configuração
1. Crie um projeto Supabase novo e exclusivo para o Maré.
2. No SQL Editor desse projeto novo, execute \`database/migrations/001_initial_schema.sql\`.
3. Em Authentication → URL Configuration, configure a URL de produção da Vercel como Site URL e permita os domínios de preview necessários.
4. Na Vercel, abra o projeto \`mare\` → Settings → Environment Variables e adicione:
   - \`VITE_SUPABASE_URL\`: URL do projeto Supabase novo.
   - \`VITE_SUPABASE_PUBLISHABLE_KEY\`: chave publishable \`sb_publishable_...\` desse projeto.
   Marque Production, Preview e Development conforme necessário e faça um novo deploy.
5. Em Authentication → Providers, mantenha Email habilitado para login por link.
6. Para testar localmente, copie \`.env.example\` para \`.env.local\`, preencha as variáveis e rode \`npm install\` e \`npm run dev\`.

## Segurança
- Nunca coloque \`service_role\`, \`sb_secret_...\`, senha de banco ou segredo Cloudinary em variáveis \`VITE_*\`; elas são expostas ao navegador.
- As tabelas da migração têm RLS e políticas por \`auth.uid()\`.
- O banco de outro sistema não deve ser alterado para instalar o Maré.
- Importação automática por URL e upload Cloudinary assinado ainda serão implementados no próximo passo.
- A primeira versão não promete disponibilidade: confirmar com o proprietário antes de fechar a reserva.

## Próximas etapas
1. Conectar e testar o Supabase exclusivo.
2. Testar CRUD do catálogo e preços e ajustar schema/interface se necessário.
3. Implementar upload Cloudinary seguro e biblioteca de fotos.
4. Melhorar importação por texto e URL, com validação SSRF e deduplicação.
5. Testes automatizados e verificação final do deploy.
