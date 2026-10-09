# Maré

Ferramenta de trabalho para organizar imóveis de temporada, consultar preços cadastrados e preparar ofertas para atendimento.

## Stack
- Vite + JavaScript para a interface responsiva.
- Vercel para hospedagem e deploy a partir do GitHub.
- Supabase Auth + PostgreSQL para login e dados.
- Supabase Storage para fotos dos imóveis.

## O que já existe
- Catálogo de imóveis com capacidade, dormitórios, suítes, comodidades e status.
- Cadastro de preços por diária ou pacote, com período e mínimo de noites.
- Importação revisável por URL do TemporadaLivre ou texto colado.
- Fotos com capa e ordenação; links públicos de vídeos do YouTube, Vimeo ou arquivos MP4/WebM/MOV.
- Montagem de oferta com datas, hóspedes, comodidades, cálculo de preço e cópia para WhatsApp.
- Login por e-mail e senha, sessão persistente e recuperação de senha.
- Interface responsiva com identidade própria em off-white, dourado suave e azul profundo.

## Regras importantes de preço
- O Maré não confirma disponibilidade: sempre confirme com o proprietário.
- Um preço sazonal só entra no cálculo automático quando tem datas que cobrem a estadia inteira.
- Preços importados com nome de período, mas sem datas, ficam como referência até que o intervalo seja cadastrado.
- Diárias respeitam o mínimo de noites.
- Se a estadia atravessar períodos com tarifas diferentes, o sistema pede confirmação em vez de inventar um total.
- O preço genérico deve ser identificado como Diária comum ou Diária base e ficar sem datas.

## Importação e mídia
- A importação por URL tenta ler título, descrição, imagens e metadados de vídeo do anúncio.
- Ao salvar um anúncio por link, o Maré tenta copiar as fotos para o Supabase Storage para que elas não dependam do link externo original. Se a origem bloquear a cópia, o sistema avisa e mantém o link original como alternativa.
- Alguns anúncios bloqueiam leitura automática; nesses casos, use a opção de colar texto e revise os campos antes de salvar.
- Vídeos são adicionados por link público; o arquivo de vídeo não é enviado ao Storage pelo formulário atual.
- Fotos são enviadas ao Supabase Storage. A configuração atual usa um bucket público para leitura das URLs.

## Configuração local
1. Copie o arquivo .env.example para .env.local.
2. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
3. Rode npm install.
4. Rode npm run dev para desenvolvimento ou npm run build para verificar a versão de produção.

## Segurança e produção
- Nunca coloque service_role, sb_secret_..., senha de banco ou segredo de upload em variáveis VITE_*; elas ficam visíveis no navegador.
- O Maré usa tabelas com prefixo mare_, separadas das tabelas do Central Imóveis.
- No projeto Supabase de teste, as políticas atuais permitem acesso compartilhado a usuários autenticados. Antes de convidar outras pessoas ou usar dados reais em produção, migre para um projeto exclusivo do Maré e configure políticas por usuário ou organização.
- Revise e confirme manualmente dados, valores, datas e disponibilidade antes de enviar uma oferta ao cliente.
- O catálogo não exibe nem exige código interno de anúncio; os imóveis são identificados pelo ID do banco, sem apresentar esse identificador ao usuário.
- A importação não impõe limite artificial de quantidade de fotos. O sistema tenta copiar todas as imagens detectadas para o Supabase Storage; se alguma cópia falhar, conserva o link original e informa o aviso.
- Os preços importados ficam na área interna de consulta e no cálculo de ofertas do Maré. Não devem ser enviados ao Feedback Maker nem incluídos em PDFs/relatórios de feedback destinados a proprietários ou clientes.
