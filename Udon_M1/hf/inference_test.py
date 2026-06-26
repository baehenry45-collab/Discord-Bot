import argparse
import os

from huggingface_hub import InferenceClient


def main():
    parser = argparse.ArgumentParser(description="Test Hugging Face Inference Providers for Udon_M1.")
    parser.add_argument("--model", default=os.getenv("UDONAI_LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct"))
    parser.add_argument("--prompt", default="Udon_M1이 뭔지 짧게 설명해줘.")
    args = parser.parse_args()

    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN 환경 변수가 필요합니다.")

    client = InferenceClient(token=token)
    completion = client.chat.completions.create(
        model=args.model,
        messages=[
            {"role": "system", "content": "너는 Udon_M1이다. 한국어로 간결하게 답한다."},
            {"role": "user", "content": args.prompt},
        ],
    )
    print(completion.choices[0].message.content)


if __name__ == "__main__":
    main()

