# Analise v13 - campanha completa

100 execucoes; 20 sementes pareadas por configuracao. F1 na escala 0-1.
e = publicacao antecipada; b = limite de avaliacoes simultaneas (0 = sem limite adicional).

| Configuracao | AUC publicada media | Limiar atingido | F1 teste mediano | Avaliacoes/s medianas | CPU-h observadas medianas | GiB-h observadas medianas | Cobertura minima |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| monolith | 0.272179 | 5/20 | 0.944820 | 0.07352 | 0.8150 | 0.9389 | 98.67% |
| distributed-e0-b0 | 0.275722 | 10/20 | 0.944993 | 0.11926 | 3.1241 | 3.2295 | 98.73% |
| distributed-e0-b3 | 0.301599 | 11/20 | 0.945189 | 0.12574 | 3.1064 | 3.1608 | 97.96% |
| distributed-e1-b0 | 0.370616 | 10/20 | 0.944993 | 0.11759 | 3.1245 | 3.2011 | 98.77% |
| distributed-e1-b3 | 0.390210 | 11/20 | 0.945189 | 0.12444 | 3.1009 | 3.1099 | 98.70% |

## Efeitos primarios predefinidos

- early_publication: diferenca media 0.091753; IC95% [-0.00030215717592593127, 0.2151050465277777]; p exato bilateral 0.164062; Holm 0.1640625.
- training_limit: diferenca media 0.022736; IC95% [0.009612436574074068, 0.03656484351851852]; p exato bilateral 0.00585938; Holm 0.01171875.
- interaction_exploratory: diferenca media -0.006283; IC95% [-0.02616384398148145, 0.014035553240740633]; p exato bilateral 0.563477; Holm nao aplicado: interacao exploratoria.

## Nao inferioridade de F1 versus e0-b0

- distributed-e0-b3: limite inferior unilateral95% 0.000122; margem -0,005; sustentada individualmente: True.
- distributed-e1-b0: limite inferior unilateral95% -0.000058; margem -0,005; sustentada individualmente: True.
- distributed-e1-b3: limite inferior unilateral95% 0.000143; margem -0,005; sustentada individualmente: True.

## Definicoes e limitacoes

- Metrica primaria usa apenas subconjuntos publicados em best-solution-messages/best-solution-trace; nao usa avaliacoes internas como substituto.
- Horario no JSON distribuido e evento do verificador, nao recebimento pelo cliente. Confirmacao de consumo Kafka e analisada separadamente pelos logs; nao comparar diretamente esse endpoint com escrita local do monolito.
- Falhas em atingir 0,945 permanecem censuradas em 2700 s; tempos censurados nao sao media apenas dos sucessos nem extrapolacao alem do prazo.
- CPU/GiB-h sao estimativas trapezoidais nas partes cobertas da janela, sem extrapolacao e sem substituir ausencias por zero. Lacunas acima de 120 s sao excluidas; ha sensibilidade a 60 s.
- Docker stats e amostrado, com timestamp capturado antes dos subprocessos; integral nao e contador cumulativo exato de CPU. Finalizacao/holdout sao excluidos por recorte temporal.
- Origem do monolito e estimada pela mediana de UTC menos tempo decorrido dos candidatos; dispersao dessa estimativa e reportada.
- Os dois testes primarios usam 20 sementes, enumeracao exata de sinais e Holm; intervalos bootstrap sao percentis de 20000 reamostragens pareadas. Interacao e contrastes com monolito sao exploratorios/descritivos.
- Nao inferioridade e avaliada individualmente, sem garantia simultanea para todas as configuracoes.
- Um host e uma divisao fixa dos dados; variabilidade entre datasets e monolito paralelo nao foram avaliados.
- Sementes replicam trajetorias aleatorias, nao hardware/dataset independentes. Teste de sinais assume permutabilidade/simetria sob a hipotese nula.
- Nenhuma configuracao foi omitida ou selecionada por F1 de teste. Casos proximos do limiar sao contabilizados para auditar arredondamento.

Dados por execucao: run-level.json. Contrastes e intervalos: analysis.json.
Proveniencia, hashes, versoes e protocolo: provenance.json.
Nenhum dado bruto foi alterado.
