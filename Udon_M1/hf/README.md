# Hugging Face 학습 실행 폴더

이 폴더는 Udon_M1의 데이터를 Hugging Face에서 파인튜닝하거나 테스트할 때 쓰는 템플릿입니다.

## 흐름

1. 우돈AI 데이터셋 생성

```bash
npm run hf:export
```

2. Hugging Face 로그인

```bash
pip install -r hf/requirements.txt
huggingface-cli login
```

3. 데이터셋 업로드

```bash
python hf/upload_dataset.py \
  --repo-id YOUR_NAME/udonai-m1-dataset \
  --jsonl exports/huggingface/udonai-m1-train.jsonl \
  --card exports/huggingface/dataset-card.md \
  --private
```

4. LoRA/SFT 학습

```bash
python hf/train_sft_lora.py \
  --dataset-jsonl exports/huggingface/udonai-m1-train.jsonl \
  --base-model Qwen/Qwen2.5-0.5B-Instruct \
  --output-dir outputs/hf-lora-udonai-m1
```

GPU가 없는 PC에서는 오래 걸리거나 실패할 수 있습니다. 실제 학습은 Hugging Face Space/GPU 런타임/Colab/VPS에서 돌리는 게 좋습니다.

## 추천 시작 모델

처음에는 너무 큰 모델보다 작은 instruct 모델로 흐름을 확인하는 게 좋습니다.

- `Qwen/Qwen2.5-0.5B-Instruct`
- `Qwen/Qwen2.5-1.5B-Instruct`
- `google/gemma-2-2b-it`, 사용 조건 확인 필요

큰 모델은 더 똑똑하지만 VRAM/비용이 올라갑니다.

