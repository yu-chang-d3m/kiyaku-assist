import urllib.request
import urllib.parse
import re
import os
from pathlib import Path
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from pypdf import PdfReader
from io import BytesIO

# プロジェクトルートを基準にパスを解決（scripts/ の親ディレクトリ）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_MLIT = PROJECT_ROOT / "data" / "mlit"
DATA_MOJ = PROJECT_ROOT / "data" / "moj"
DATA_NIHON_HOUSING = PROJECT_ROOT / "data" / "nihon-housing"

def ensure_dirs():
    """出力先ディレクトリを作成（存在しない場合）"""
    DATA_MLIT.mkdir(parents=True, exist_ok=True)
    DATA_MOJ.mkdir(parents=True, exist_ok=True)
    DATA_NIHON_HOUSING.mkdir(parents=True, exist_ok=True)

def fetch_moj_page():
    url = "https://www.moj.go.jp/MINJI/minji07_00325.html"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    html_content = response.read().decode('utf-8')
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Try to find the main content area
    main_content = soup.find('main') or soup.find('div', id='main') or soup.find('div', class_='contents') or soup.body
    
    markdown_content = md(str(main_content), heading_style="ATX", escape_asterisks=False)
    
    out_path = DATA_MOJ / "moj_minji_07_00325.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("# 法務省：区分所有法制の見直し\n")
        f.write(f"Source URL: {url}\n\n")
        f.write(markdown_content)
    print(f"Saved {out_path}")

def fetch_mlit_page_and_pdf():
    url = "https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk5_000052.html"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    html_content = response.read().decode('utf-8')
    soup = BeautifulSoup(html_content, 'html.parser')
    
    pdf_href = None
    # We want "マンション標準管理規約（単棟型）新旧対照表"
    # Actually, we can get all "新旧対照表" links
    for a in soup.find_all('a', href=True):
        if '新旧対照表' in a.text and a['href'].endswith('.pdf'):
            if '単棟型' in a.text:
                pdf_href = a['href']
                break
    
    if not pdf_href:
        # Fallback to any new-old table
        for a in soup.find_all('a', href=True):
            if '新旧対照表' in a.text and a['href'].endswith('.pdf'):
                pdf_href = a['href']
                break

    if pdf_href:
        pdf_url = urllib.parse.urljoin(url, pdf_href)
        print(f"Downloading PDF from: {pdf_url}")
        
        pdf_req = urllib.request.Request(pdf_url, headers={'User-Agent': 'Mozilla/5.0'})
        pdf_response = urllib.request.urlopen(pdf_req)
        pdf_bytes = pdf_response.read()
        
        reader = PdfReader(BytesIO(pdf_bytes))
        extracted_text = ""
        for page in reader.pages:
            extracted_text += page.extract_text() + "\n\n"
        
        out_path = DATA_MLIT / "mlit_mansion_kyaku_shinkyu_taishou.md"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("# 国土交通省：マンション標準管理規約（単棟型）新旧対照表\n")
            f.write(f"Source URL: {pdf_url}\n\n")
            f.write("```text\n")
            f.write(extracted_text)
            f.write("\n```\n")
        print(f"Saved {out_path}")
    else:
        print("Could not find the PDF link for 新旧対照表 on MLIT page.")

if __name__ == '__main__':
    ensure_dirs()
    fetch_moj_page()
    fetch_mlit_page_and_pdf()
