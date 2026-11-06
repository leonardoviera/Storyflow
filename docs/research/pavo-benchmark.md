# Benchmark: Pavo AI vs. StoryFlow

**Data**: 2026-11-04. **Fonte**: navegação guiada em `app.pavo-ai.work`, só leitura (nenhuma geração,
nenhum crédito gasto, nada criado na conta). **Objetivo**: entender o fluxo "roteiro → cenas →
assets → vídeo" do Pavo e decidir o que o StoryFlow consegue fazer **100% local** (constituição
v2.0.0). É material de entrada para a spec 002; não é um plano de copiar a interface.

---

## 1. Mapa do produto

Menu lateral: **Inspiration** (Home), **Skill**, **Short Drama**, **Canvas**, **Project**, **Assets**.

| Área | O que é |
|---|---|
| Home | Caixa "What do you want to create today?": texto + materiais de referência citados com `@` (`@Image1 imita os movimentos do @Video1`). Seletores: tipo (Short Drama, Agent, Image Generation, Video Generation), modelo de vídeo (Agnes Video 2.5 Flash, Agnes Video 2.5, Seedance 2.5, Wan 3.0, …), modo (Omni Mode, First and Last Frames), duração/resolução (Auto, 4 s, 720p). Atalhos para Short Drama, Infinite Canvas e skills. Galeria pública "Pavo.Show". |
| Skill | Catálogo de "skills" (agentes com prompt pronto) por categoria: publicidade, cinema/TV, animação/games, short dramas, redes sociais, efeitos, clipes, educação. Cada uma tem introdução, casos de uso, como usar, saída esperada e o modelo usado. |
| Short Drama | O fluxo principal de roteiro → vídeo (seção 2). |
| Canvas | Quadro infinito com **nós** ligados por arestas: imagens de referência → grupo de imagens (personagens, produto) → nó de vídeo final. Cada nó é uma geração; as arestas dizem qual imagem serve de referência para qual. |
| Project | Histórico de gerações avulsas, no formato de chat. |
| Assets | "Creative assets" (Imagens, Vídeos, Áudio, Short film), "Main assets" (biblioteca global de **Personagens, Cenários, Objetos**, reaproveitável entre projetos) e "Published". |

## 2. Short Drama em detalhe

### 2.0 Criação do projeto
Duas entradas na mesma tela:
- **Upload My Script**: TXT/DOCX ou colar o texto, até 100.000 palavras.
- **Generate Script with AI**: ideia em texto livre (até 100.000 caracteres) + **Style Library**
  (estilos com prévia, filtros 2D / 3D / Real Person, mais "Custom Style") + formato (9:16) +
  número de episódios (ex.: 10).

### 2.1 Etapa 1: Script Outline
- Cabeçalho: nome, **Video Style** (ex.: "realpeople ancient chinese") e **Aspect Ratio**.
- **Synopsis**: Episódios, Tipo de história, Público-alvo, Resumo, Ambientação (World Setting) e
  Perfis dos personagens (nome + descrição).
- **Script Content**: um bloco por episódio, com status ("Completed"), em formato de roteiro:
  cabeçalho de cena (`[Cena] Dia, local`), linhas de ação (`△ …`), falas
  (`Personagem (rubrica): fala`) e indicações de trilha (`BGM`). Menu "···" → Download Script.
- Rodapé: "Script organized. Assets are ready to be generated." → Next.

### 2.2 Etapa 2: Asset Library
Três abas: **Characters List**, **Scenes List**, **Props List**, extraídas do roteiro. Cada item
tem imagem, variantes ("Variant Added 1/1", `+` adiciona variante), **Regenerate** e "Add New"
(em branco ou da biblioteca global). "Os assets desta página são usados no projeto inteiro."

**Ficha do personagem** (Character Info):
- Nome, **Nome da variante** (ex.: "cotidiano"; uma aba por variante + "Add").
- **Voz**: "AI Auto" (escolhe o timbre pela aparência), vozes oficiais com nome, Upload (clonar)
  e Gerar timbre (os dois pagos), favoritos, e uma **descrição do timbre** em texto.
- Episódios em que aparece; **descrição visual** (até 1.200 caracteres); modelo de imagem
  (Seedream 5.0 Pro); estilo.
- Duas imagens geradas, cada uma com histórico: **retrato** e **folha de referência** (rosto +
  corpo inteiro de frente, de lado e de costas). Custo mostrado no botão Generate.

### 2.3 Etapa 3: Episode Videos
- Grade de episódios: miniatura, duração e contagens ("3 Characters | 2 Scene | 5 shots |
  50 seconds"). "New Episode", "Bulk Select", menu "···" → Export.
- **Editor do episódio**:
  - Coluna de **segmentos** (miniaturas). Cada segmento: título, duração **4–15 s**, cenário do
    clipe (chip `@cenário`), e uma lista de **tomadas** (título + duração, ex.: 3 s, 5 s +
    descrição de câmera/ação/fala). Personagens e cenários entram no texto com **`@`**, como
    chips (`@Lin Xiaoman·cotidiano`).
  - Modo de edição: alterar texto e duração, adicionar/remover tomadas, Cancel/Confirm.
  - Painel **Keyframes** (opcional): gerar imagens de storyboard primeiro, "para personagens mais
    consistentes".
  - Painel **Vídeo**: Generate + histórico de versões; Preview toca o segmento (vídeo com a
    personagem falando a fala).
  - Barra superior: **Batch Generate Images**, **Batch Generate Videos**, Bulk Download,
    Preview, **Render Final Video**.

### 2.4 Skills relevantes
- **Drama Script to Storyboard**: roteiro → lista de tomadas com 7 colunas: ID, tempo/duração,
  enquadramento, ação visual, marcação dos personagens e direção do olhar, câmera,
  diálogo/som. Não gera imagem nem vídeo por padrão.
- **Casting Director & Character Sheet**: identifica personagens, junta apelidos, ordena por
  importância, completa detalhes visuais faltantes; gera uma folha por personagem (fundo branco
  4:3: frente, lado, costas + close do rosto).

### 2.5 Storyboard em detalhe (revisita de 2026-11-06)
Navegação só de leitura no projeto de exemplo da seção Short Drama (editor do episódio 1) e na
página da skill.

- **A skill confirma as 7 colunas** da seção 2.4. Ela preserva os eventos, as falas e a
  **continuidade espacial** do roteiro, e pode criar um nó de texto por tomada no Infinite Canvas.
  Não é uma tela própria do Short Drama.
- **No editor do episódio, o storyboard é o próprio segmento.** O segmento começa com "Generate a
  video composed of the following storyboards" e miniaturas dos assets citados (cenário +
  personagens). Cada tomada tem título, duração (3–5 s no exemplo) e **um parágrafo de prosa
  densa**, não colunas separadas. Esse parágrafo junta:
  - enquadramento e **ângulo** (plongée em diagonal, câmera na altura dos olhos);
  - **lente e estilo de imagem** (35 mm Panavision, luz natural suave, grão e paleta "anos 90");
  - movimento de câmera e **quadro final** ("termina congelado em…");
  - **marcação e olhar** (quem está onde, para onde olha) e a emoção;
  - **continuidade com a tomada anterior** ("continuando o plano anterior…");
  - a fala entre aspas, dentro do texto.
- **Diretiva no nível do segmento**, no fim da lista de tomadas: sem legendas nem texto na tela,
  manter uma BGM coerente e o som ambiente, sem silêncio.
- **Keyframes** (opcional, por segmento): uma imagem que ilustra o segmento, com histórico de
  versões. A versão marcada serve de referência para o vídeo.
- **Vídeo**: um vídeo por segmento, gerado a partir das tomadas + keyframe, com histórico.
- Não vi exportação do storyboard em si (tabela, PDF). O "Export" do episódio exporta vídeo.

**Comparação com o `Shot` do StoryFlow** (`packages/shared/src/breakdown/document.ts`):
ID, duração, enquadramento, ação, câmera e fala/som já existem. Faltam marcação/olhar, ângulo,
quadro final e continuidade explícitos. Hoje eles só aparecem se o LLM os puser em `action`. A
diretiva de áudio/legenda por segmento e o estilo visual do projeto (o Pavo mostra "Video Style"
no topo do Script Outline) também não têm campo. Keyframes e vídeo dependem de geração de imagem
e vídeo, portanto ficam nas fases B–D.

## 3. Modelo de dados observado

```
Projeto ─ estilo visual, formato, sinopse (tipo, público, ambientação)
 ├─ Personagem ─ variantes (cada uma: descrição visual, voz/timbre, retrato, folha de referência)
 ├─ Cenário    ─ variantes (imagem)
 ├─ Objeto     ─ variantes (imagem)
 └─ Episódio ─ roteiro (texto) ─ segmentos (4–15 s, cenário)
                                   └─ tomadas (duração, descrição com @refs, fala)
                                        → imagem-chave (opcional) → vídeo do segmento
             → vídeo final do episódio
```

A ideia central: **assets globais e referenciáveis** (`@`) garantem consistência visual entre
tomadas; a geração é **em etapas revisáveis** (roteiro → assets → keyframes → vídeo), cada uma
com histórico e "regenerar".

## 4. O que o StoryFlow consegue fazer

Situação: LLM `gpt-oss:20b` no servidor da rede (`10.0.0.78`), **em GPU** (13,6 GB de VRAM, fixo na
memória, `keep_alive` infinito), Blender para 3D, Remotion para composição, MinIO, Postgres.

| Capacidade do Pavo | No StoryFlow | Como (local) | Esforço |
|---|---|---|---|
| Colar/enviar roteiro (TXT/DOCX) | **Viável já** | Upload para MinIO + extração de texto (DOCX via biblioteca local) | Baixo |
| Gerar roteiro a partir de ideia | **Já existe** (prompt → cenas) | Ampliar o schema para roteiro completo | Baixo |
| Sinopse, ambientação, perfis | **Viável já** | LLM com saída estruturada (já usamos `json_schema`) | Baixo |
| Quebra em episódios → segmentos → tomadas (7 colunas) | **Viável já** | LLM; validar com Zod; durações somam o alvo | Médio |
| Extrair personagens/cenários/objetos e citar com `@` | **Viável já** | LLM extrai a "bíblia"; tomadas guardam IDs dos assets | Médio |
| Editor de tomadas com chips `@` | **Viável já** | UI Next.js (menção com autocomplete) | Médio |
| Estilo visual do projeto | **Viável** | Preset de estilo = prompt + modelo/LoRA no gerador de imagem | Baixo* |
| Imagem do personagem / folha de referência | **Precisa de serviço novo** | ComfyUI com SDXL ou FLUX.1; folha frente/lado/costas por prompt + controle de pose | Alto |
| Consistência do personagem entre tomadas | **Precisa de serviço novo** | ComfyUI + IP-Adapter / PuLID / referência por imagem | Alto |
| Imagem-chave por tomada | **Precisa de serviço novo** | ComfyUI (mesmo serviço acima) | Médio* |
| Vídeo por tomada (IA) | **Possível, mas pesado** | Wan 2.x (pesos abertos) ou LTX-Video no ComfyUI; segundos de vídeo por minutos de GPU | Alto |
| Vídeo por tomada (sem IA de vídeo) | **Viável já** | Remotion anima a imagem-chave (zoom, pan, parallax), texto, legendas, overlay 3D do Blender | Médio |
| Voz/narração e falas | **Precisa de serviço novo** | TTS local (ex.: Piper, que roda em CPU e tem vozes pt-BR); clonagem exige modelos com licenças a checar | Médio |
| Personagem falando (lip sync) | **Pesado / licenças** | Modelos de lip sync locais existem, mas vários têm licença não comercial | Alto |
| Trilha sonora | **Upload** (geração local tem licenças restritivas) | Biblioteca de músicas do usuário no MinIO | Baixo |
| Render final | **Já existe** | Remotion (H.264, 4 threads, MinIO) | — |
| Biblioteca global de assets | **Viável já** | Tabelas de Personagem/Cenário/Objeto ligadas ao usuário, não ao projeto | Médio |
| Histórico/versões e "regenerar" | **Parcial** (Jobs + ScriptVersion) | Estender o versionamento para assets e tomadas | Médio |
| Canvas de nós | Fora de escopo agora | Pode virar uma visão alternativa depois | — |
| Catálogo de skills | Fora de escopo agora | No nosso caso, presets de prompt do LLM | — |

\* depende do serviço de imagem existir.

### Restrições a decidir

1. **GPU compartilhada**: o `gpt-oss:20b` ocupa 13,6 GB de VRAM o tempo todo. Gerar imagens
   (SDXL ~8 GB, FLUX ~12–24 GB) ou vídeo (Wan/LTX, 12–24 GB+) na mesma GPU exige liberar o LLM
   entre etapas (`keep_alive` curto) ou outra GPU. Falta saber o modelo da placa e a VRAM total.
2. **Constituição v2.0.0**: só o servidor de **LLM** pode ficar fora do compose. Um ComfyUI ou um
   TTS no servidor da rede exige outra emenda (MAJOR: estende a exceção da regra I/V), ou rodar
   esses serviços no compose com GPU passthrough.
3. **Licenças**: FLUX.1-dev e vários modelos de voz, lip sync e música têm licença não comercial.
   Para uso comercial: SDXL, FLUX.1-schnell, Wan 2.x, Piper; confirmar cada um antes de adotar.
4. **Tempo**: vídeo por IA local leva minutos por segmento. Um episódio de 50 s com 10 segmentos
   pode levar horas. A fila pg-boss já suporta isso, mas a UX precisa de progresso por item.

## 5. Proposta de escopo para a spec 002

Em fases que entregam valor sozinhas:

- **Fase A (sem serviço novo)**: tela inicial de roteiro (colar/enviar ou gerar), sinopse,
  quebra em episódios → segmentos → tomadas, extração de personagens/cenários/objetos com
  ficha e `@` nas tomadas, revisão/edição, e montagem automática da timeline (texto, legendas,
  overlays 3D do Blender, imagens enviadas pelo usuário). Render no Remotion.
- **Fase B (serviço de imagem)**: ComfyUI local; estilo visual do projeto; retrato e folha de
  referência por personagem/cenário/objeto, com variantes, histórico e regenerar; imagem-chave
  por tomada, consistente com as referências. O Remotion anima as imagens-chave.
- **Fase C (voz)**: TTS local para narração e falas, uma voz por personagem; legendas sincronizadas.
- **Fase D (vídeo por IA, opcional)**: vídeo por segmento a partir da imagem-chave (Wan/LTX),
  se a GPU permitir.

## 6. Perguntas abertas

1. Qual GPU (modelo e VRAM) tem o servidor `10.0.0.78`? Ela pode ser liberada entre etapas?
2. Episódios (séries curtas) ou um único vídeo por projeto?
3. Começar pela Fase A sozinha ou já incluir a Fase B?
4. Uso comercial? Isso decide quais modelos de imagem e voz são aceitáveis.
5. Formatos de saída: 9:16 (vertical) é o principal, ou 16:9 também?
