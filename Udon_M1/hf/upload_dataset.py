import argparse
from pathlib import Path

from huggingface_hub import HfApi, create_repo, upload_file


def main():
    parser = argparse.ArgumentParser(description="Upload Udon_M1 dataset files to Hugging Face Hub.")
    parser.add_argument("--repo-id", required=True, help="예: username/udonai-m1-dataset")
    parser.add_argument("--jsonl", default="exports/huggingface/udonai-m1-train.jsonl")
    parser.add_argument("--card", default="exports/huggingface/dataset-card.md")
    parser.add_argument("--private", action="store_true")
    args = parser.parse_args()

    jsonl = Path(args.jsonl)
    card = Path(args.card)
    if not jsonl.exists():
        raise FileNotFoundError(jsonl)
    if not card.exists():
        raise FileNotFoundError(card)

    create_repo(args.repo_id, repo_type="dataset", private=args.private, exist_ok=True)
    api = HfApi()
    upload_file(
        path_or_fileobj=str(jsonl),
        path_in_repo="udonai-m1-train.jsonl",
        repo_id=args.repo_id,
        repo_type="dataset",
    )
    upload_file(
        path_or_fileobj=str(card),
        path_in_repo="README.md",
        repo_id=args.repo_id,
        repo_type="dataset",
    )
    print({"ok": True, "repo_id": args.repo_id, "jsonl": str(jsonl), "card": str(card)})


if __name__ == "__main__":
    main()
