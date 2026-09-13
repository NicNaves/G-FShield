# Relatório final da comparação IWSHAP e da campanha arquitetural

Data de fechamento dos experimentos: 13 de setembro de 2026.

## Rastreabilidade

- Campanha: `gfshield-iwshap-paired-formal-2026`.
- Estado: `CAMPAIGN_COMPLETED`, 120/120 execuções válidas (30 sementes por
  cenário e arquitetura).
- Integridade: 120 manifestos e 1.500 arquivos enumerados foram recalculados;
  nenhuma divergência SHA-256 foi encontrada.
- SHA-256 do `state.json`:
  `22213d22cec5f4039df83d386078b2332133191a03f2692d9b8ff739c2ba32025`.
- Manifesto de dados:
  `d7bd8b3db3a2026d32ef24f64c97845cbcbe0a16ecb6df37494105c9e222d84a`.
- Código IWSHAP auditado: commit
  `fb0d3093c12421d08ab3fb595d20c29ba2442e65`.
- Imagem da reprodução original:
  `sha256:deb8fafc72944621d3394488f1e0c990df6cd20372c67e2d441ec68edf5b8c64`.
- Commits locais da instrumentação/análise:
  `bc47acd`, `c31dc30`, `67c2b8d` e `f94b022` na branch
  `experiment/iwshap-comparison`.
- Cópia integral anterior à integração das dissertações:
  `backups/dissertacoes-pre-integracao-iwshap-20260913.tar.gz`, SHA-256
  `9ad4e08a5a3cd10fb69b747f0b7f547b04bf73fc1dd096e5e9e78907784a5a9c`.

Os CSVs, figuras, manifestos e a proveniência usados neste relatório estão em
`docs/dissertation-review/iwshap-comparison-analysis/`. O pacote transferido do
servidor está em `iwshap-study-results-20260913.tar.gz`, SHA-256
`5f71bb6e0401d886ebf7078bdc38c5fd76732ca2954108c6a99ccc67c535d0c9`.

## Protocolo congelado

Cada braço recebeu 1.200 s, dos quais 120 s foram reservados à finalização; a
janela de seleção foi, portanto, 1.080 s. O limite global foi dez dias. Foram
usados ReliefF, VND e IWSSR, máximo de 50 melhorias aceitas, melhora mínima de
0,0001, três consumidores no pipeline, teto agregado de 6 CPUs e 12 GiB,
`cpuset=8-15` e nó NUMA 1. O servidor possui dois Xeon E5-2620 v4, 32 CPUs
lógicas e aproximadamente 64 GiB de RAM.

Os dois cenários têm 20.000 registros e 688 preditores. Para suspensão, as
partições por grupos de vetores idênticos contêm 12.081/3.892/4.027 registros em
treino/validação/teste e 14.743 vetores únicos. Para fabricação, contêm
11.944/3.994/4.062 registros e 13.553 vetores únicos. O particionamento 60/20/20
garante que um vetor completo idêntico não apareça em mais de uma partição.

## Arquitetura distribuída versus monólito pareado (Weka J48)

Todos os valores são medianas de 30 pares. Testes secundários usaram permutação
pareada com 200.000 repetições, bootstrap com 20.000 repetições e correção de
Holm dentro de cada família.

| Cenário | Medida | G-FShield | Monólito | Conclusão |
|---|---:|---:|---:|---|
| Suspensão | F1 macro de teste | 0,790717 | 0,787396 | diferença mediana +0,000665; `p_Holm=0,438598` |
| Fabricação | F1 macro de teste | 0,902245 | 0,900280 | diferença mediana 0; `p_Holm=1` |
| Suspensão | AUC anytime | 0,724464 | 0,733062 | favorece monólito; `p_Holm≈0,000030` |
| Fabricação | AUC anytime | 0,831286 | 0,839406 | favorece monólito; `p_Holm≈0,000030` |
| Suspensão | avaliações IWSSR/s | 8,580 | 3,698 | favorece vazão distribuída em todos os pares |
| Fabricação | avaliações IWSSR/s | 8,302 | 3,678 | favorece vazão distribuída em todos os pares |
| Suspensão | sobreposição construção--busca local | 99,657% | 0% | mecanismo concorrente confirmado |
| Fabricação | sobreposição construção--busca local | 99,664% | 0% | mecanismo concorrente confirmado |
| Suspensão | CPU-segundos estimados | 3.853,1 | 1.100,7 | custo maior no distribuído |
| Fabricação | CPU-segundos estimados | 3.858,4 | 1.096,9 | custo maior no distribuído |
| Suspensão | pico de RAM (MiB) | 3.370,3 | 770,1 | custo maior no distribuído |
| Fabricação | pico de RAM (MiB) | 3.169,8 | 774,6 | custo maior no distribuído |

O tempo descritivo até o F1 de validação do baseline com todos os atributos
também favoreceu o monólito: 92,071 s contra 114,463 s em suspensão e 90,091 s
contra 101,047 s em fabricação. Esse limiar existia antes da análise, mas não foi
incluído no manifesto congelado; por isso, não recebe interpretação
confirmatória.

Conclusão arquitetural válida: a decomposição permite sobrepor construção e
busca local e explora paralelismo para elevar a vazão bruta de IWSSR em cerca de
2,3 vezes. Não há evidência de superioridade global: o F1 final é equivalente,
o monólito tem melhor trajetória anytime e o distribuído consome mais CPU e RAM.

## Reprodução do IWSHAP original

A reprodução usou exatamente pandas 2.2.2, NumPy 1.26.4, SHAP 0.45.1,
XGBoost 2.0.3 e scikit-learn 1.5.0. O código original codifica categorias antes
da divisão 80/20 (`random_state=42`) e reutiliza os mesmos 20% durante a seleção
e no resultado reportado; portanto, esses escores não constituem teste intocado.

- Suspensão: baseline F1 positivo 0,456265; melhor F1 positivo 0,635693 com dois
  atributos; 52,6 s. O resultado não coincide com o log histórico de junho, que
  não registra hash nem quantidade de linhas.
- Fabricação: baseline F1 positivo 0,794549; melhor F1 positivo 0,787387 com
  quatro atributos; 82,7 s. A execução reproduz o subconjunto do log histórico.

## Comparação por classificador comum (XGBoost)

Os 120 subconjuntos congelados e os dois comparadores de cada cenário foram
retreinados somente no treino, avaliados na validação e consultados uma vez no
teste intocado, com o mesmo XGBoost. A comparação com o único subconjunto
histórico do IWSHAP é descritiva, pois esse comparador fixo não constitui uma
amostra estocástica pareável.

| Cenário | Método | n | atributos (mediana) | redução | F1 macro teste | F1 positivo teste |
|---|---|---:|---:|---:|---:|---:|
| Suspensão | todos os atributos | 1 | 688 | 0% | 0,734966 | 0,532915 |
| Suspensão | subconjunto histórico IWSHAP | 1 | 16 | 97,67% | 0,830048 | 0,699894 |
| Suspensão | G-FShield | 30 | 20,5 | 97,02% | 0,723518 | 0,511074 |
| Suspensão | monólito pareado | 30 | 21 | 96,95% | 0,723544 | 0,510315 |
| Fabricação | todos os atributos | 1 | 688 | 0% | 0,882397 | 0,795019 |
| Fabricação | subconjunto histórico IWSHAP | 1 | 4 | 99,42% | 0,882423 | 0,799667 |
| Fabricação | G-FShield | 30 | 17 | 97,53% | 0,887680 | 0,803178 |
| Fabricação | monólito pareado | 30 | 17 | 97,53% | 0,889053 | 0,805639 |

Em suspensão, nenhuma das 30 execuções G-FShield superou o subconjunto histórico
IWSHAP em F1 macro ou F1 positivo. Em fabricação, 26/30 superaram o IWSHAP em F1
macro e 16/30 em F1 positivo. O maior F1 macro observado foi 0,900958, na execução
G-FShield de semente 20260916, com 19 atributos; seu F1 positivo foi 0,826347.
Entretanto, o subconjunto IWSHAP de fabricação obteve revocação positiva 0,979633,
contra mediana 0,820774 do G-FShield, enquanto a precisão mediana favoreceu o
G-FShield (0,787196 contra 0,675562). Assim, a vantagem de fabricação é um
compromisso precisão--revocação e utiliza mais atributos (17 contra 4).

## Texto permitido na dissertação

É sustentado afirmar que o G-FShield demonstra concorrência entre fases e maior
vazão bruta de avaliações locais sob o teto agregado adotado. Também é sustentado
afirmar vantagem descritiva de F1 no cenário de fabricação sob o XGBoost comum,
condicionada ao custo em atributos e revocação. Não é sustentado afirmar que a
arquitetura distribuída é universalmente mais rápida, mais eficiente ou superior
ao IWSHAP nos dois cenários.

## Experimentos ainda recomendados

1. Congelar previamente uma medida de rendimento de soluções distintas acima de
   um limiar de qualidade e testá-la em sementes novas.
2. Executar múltiplas solicitações independentes concorrentes para medir vazão do
   sistema, latência p50/p95, filas e backpressure; o experimento atual mede uma
   solicitação de otimização por vez.
3. Repetir em outros hosts, limites de CPU/RAM e graus de paralelismo para obter
   curvas de escalabilidade e custo por solução útil.
4. Executar injeção de falhas planejada para medir recuperação e reprocessamento;
   reinicializações acidentais não são evidência de tolerância a falhas.
5. Obter o arquivo exato associado ao log histórico de suspensão do IWSHAP para
   eliminar a incerteza de versão/volume desse estrato.
