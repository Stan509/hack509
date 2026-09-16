"""
TPS & FPS Domestic Search & Page Capture Service.
No synthetic, mocked or fabricated leads are produced.
Extracts structured contact information ONLY from real pages actively viewed by the operator.
"""
import re
import logging
import urllib.parse
from datetime import datetime

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

logger = logging.getLogger(__name__)

ALLOWED_DOMAINS = [
    'truepeoplesearch.com',
    'www.truepeoplesearch.com',
    'fastpeoplesearch.com',
    'www.fastpeoplesearch.com',
    'ip-api.com',
    'ipinfo.io',
    'api.ipify.org',
]


def is_allowed_url(url: str) -> bool:
    """Validate that the target URL belongs strictly to authorized domains."""
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc.lower()
        # Strip port if any
        if ':' in netloc:
            netloc = netloc.split(':')[0]
        return netloc in ALLOWED_DOMAINS
    except Exception:
        return False

def clean_phone(phone_str: str) -> str:
    """Normalize phone string to E.164-compatible USA phone without inventing numbers."""
    if not phone_str:
        return ''
    digits = ''.join(c for c in phone_str if c.isdigit())
    if len(digits) == 10:
        return '+1' + digits
    if len(digits) == 11 and digits.startswith('1'):
        return '+' + digits
    return '+' + digits if digits else ''

def sanitize_csv_field(val: str) -> str:
    """
    Neutralize CSV formula injection (=, +, -, @, tab, return).
    Prevents execution of malicious payloads in Excel/Calc.
    """
    if not val:
        return ''
    s = str(val).strip()
    if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + s
    return s

def extract_city_state(location_str: str):
    """Attempt to parse city and 2-letter state from address string."""
    if not location_str:
        return '', ''
    match = re.search(r'\b([A-Za-z\s\.\'-]+?),\s*([A-Z]{2})\b', location_str)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return '', ''

def parse_active_page_dom(html_content: str, source_url: str = '') -> list:
    """
    Parse the currently visible DOM from Chromium for TPS or FPS.
    Extracts ONLY real fields present on the page.
    Never invents names, numbers, or addresses.
    """
    if not html_content or not BeautifulSoup:
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    captured_at = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    
    is_tps = 'truepeoplesearch.com' in (source_url or '').lower()
    is_fps = 'fastpeoplesearch.com' in (source_url or '').lower()
    
    # Auto-detect if url is not conclusive
    if not is_tps and not is_fps:
        if soup.find(text=re.compile(r'TruePeopleSearch', re.IGNORECASE)):
            is_tps = True
        elif soup.find(text=re.compile(r'FastPeopleSearch', re.IGNORECASE)):
            is_fps = True

    results = []
    seen_contacts = set()

    if is_tps:
        # TruePeopleSearch result cards
        # Primary container: .card, .card-summary, or .detail-card
        cards = soup.select('.card-summary, .card, div[data-detail-link], .record-card')
        if not cards:
            cards = soup.select('div.row.pl-md-1, div.shadow-sm')

        for card in cards:
            # 1. Full name
            name_el = card.select_one('.h4, .h2, a[data-link-to-more="person"], .name, h2')
            if not name_el:
                continue
            full_name = name_el.get_text(separator=' ', strip=True)
            # Remove age suffixes like "(Age 45)"
            full_name = re.sub(r'\(Age\s*\d+\)', '', full_name, flags=re.IGNORECASE).strip()
            
            parts = [p for p in full_name.split() if p]
            if not parts or len(parts) == 0:
                continue
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

            # 2. Phone
            phone_el = card.select_one('a[data-link-to-more="phone"], a[href^="tel:"], .phone, span[itemprop="telephone"]')
            phone_raw = phone_el.get_text(strip=True) if phone_el else ''
            if not phone_raw:
                # Search by regex in card text
                m = re.search(r'\(?\b[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', card.get_text())
                if m:
                    phone_raw = m.group(0)
            phone = clean_phone(phone_raw)

            # 3. Location / Address
            addr_el = card.select_one('span[itemprop="address"], .address, a[data-link-to-more="address"], .location')
            addr_raw = addr_el.get_text(separator=' ', strip=True) if addr_el else ''
            city, state = extract_city_state(addr_raw)

            # 4. Company (if any)
            comp_el = card.select_one('.company, .carrier, .business')
            company = comp_el.get_text(strip=True) if comp_el else ''

            # Duplicate prevention on the same page
            key = f"{first_name.lower()}_{last_name.lower()}_{phone}"
            if key in seen_contacts:
                continue
            seen_contacts.add(key)

            results.append({
                'first_name': first_name,
                'last_name': last_name,
                'company': company,
                'phone': phone,
                'city': city,
                'state': state,
                'address': addr_raw,
                'source': 'TPS',
                'source_url': source_url or 'https://www.truepeoplesearch.com',
                'captured_at': captured_at,
            })

    elif is_fps:
        # FastPeopleSearch result cards
        cards = soup.select('.card-block, .people-list .card, .search-item, div.card')
        for card in cards:
            name_el = card.select_one('.card-title, h2, a[href^="/name/"], .name')
            if not name_el:
                continue
            full_name = name_el.get_text(separator=' ', strip=True)
            full_name = re.sub(r'\(Age\s*\d+\)', '', full_name, flags=re.IGNORECASE).strip()
            
            parts = [p for p in full_name.split() if p]
            if not parts:
                continue
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

            phone_el = card.select_one('a[href^="/phone/"], a[data-link-to-more="phone"], a[href^="tel:"]')
            phone_raw = phone_el.get_text(strip=True) if phone_el else ''
            if not phone_raw:
                m = re.search(r'\(?\b[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', card.get_text())
                if m:
                    phone_raw = m.group(0)
            phone = clean_phone(phone_raw)

            addr_el = card.select_one('.location-details, .nowrap, p[itemprop="address"], .address')
            addr_raw = addr_el.get_text(separator=' ', strip=True) if addr_el else ''
            city, state = extract_city_state(addr_raw)

            comp_el = card.select_one('.carrier, .company, .business')
            company = comp_el.get_text(strip=True) if comp_el else ''

            key = f"{first_name.lower()}_{last_name.lower()}_{phone}"
            if key in seen_contacts:
                continue
            seen_contacts.add(key)

            results.append({
                'first_name': first_name,
                'last_name': last_name,
                'company': company,
                'phone': phone,
                'city': city,
                'state': state,
                'address': addr_raw,
                'source': 'FPS',
                'source_url': source_url or 'https://www.fastpeoplesearch.com',
                'captured_at': captured_at,
            })

    # Generic fallback extractor if the site structure shifted slightly
    if not results:
        # Look for telephone links or phone regex in paragraphs
        name_candidate = soup.find('h1') or soup.find('h2')
        if name_candidate:
            name_text = name_candidate.get_text(strip=True)
            name_text = re.sub(r'(?:Results for|Search for|TruePeopleSearch|FastPeopleSearch).*$', '', name_text, flags=re.IGNORECASE).strip()
            parts = [p for p in name_text.split() if p]
            if len(parts) >= 2:
                first_name = parts[0]
                last_name = ' '.join(parts[1:])
                # Find first valid US phone in body
                body_text = soup.get_text()
                pm = re.search(r'\(?\b[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', body_text)
                found_phone = clean_phone(pm.group(0)) if pm else ''
                
                if found_phone:
                    results.append({
                        'first_name': first_name,
                        'last_name': last_name,
                        'company': '',
                        'phone': found_phone,
                        'city': '',
                        'state': '',
                        'address': '',
                        'source': 'TPS' if is_tps else ('FPS' if is_fps else 'WEB'),
                        'source_url': source_url,
                        'captured_at': captured_at,
                    })

    return results
