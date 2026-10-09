# Maré

Sistema independente para gestão de imóveis de temporada: catálogo, preços por diária e pacote, importação revisável e montagem de ofertas.

## Stack
- Vite + JavaScript para a interface responsiva.
- Vercel para hospedagem e deploy a partir do GitHub.
- Supabase Auth + PostgreSQL com Row Level Security.
- Cloudinary para fotos (integração de upload na próxima etapa).

## Estado atual
O Maré está em teste no projeto Supabase já existente: suas tabelas usam o prefixo `mare_`, sem alterar as tabelas do Central Imóveis. A autenticação é compartilhada durante esse teste. Para produção, mova o Maré para um projeto exclusivo.

## Configuração
1. Para o teste atual, use o projeto Supabase existente. Para produção, crie um projeto exclusivo do Maré.
2. As tabelas de teste com prefixo `mare_` já foram criadas no projeto atual. Em um projeto novo, execute \`database/migrations/001_initial_schema.sql\`.
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
- As tabelas do Central Imóveis não devem ser alteradas pelo Maré. Durante o teste, autenticação e usuários do Supabase são compartilhados.
- Importação automática por URL e upload Cloudinary assinado ainda serão implementados no próximo passo.
- A primeira versão não promete disponibilidade: confirmar com o proprietário antes de fechar a reserva.

## Próximas etapas
1. Separar o Maré em um projeto Supabase exclusivo antes do uso real.
2. Testar CRUD do catálogo e preços e ajustar schema/interface se necessário.
3. Implementar upload Cloudinary seguro e biblioteca de fotos.
4. Melhorar importação por texto e URL, com validação SSRF e deduplicação.
5. Testes automatizados e verificação final do deploy.
