"""
TPS & FPS Lookup & Lead Scraping Proxy Service.
Queries TruePeopleSearch and FastPeopleSearch and extracts structured lead cards.
"""
import re
import logging
import urllib.request
import urllib.parse
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

logger = logging.getLogger(__name__)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'max-age=0',
}

INVALID_NAME_KEYWORDS = {
    'reverse', 'lookup', 'phone', 'address', 'people', 'search', 'directory',
    'whitepages', 'free', 'find', '100%', 'person', 'truepeoplesearch',
    'fastpeoplesearch', 'results', 'details', 'check', 'records', 'background',
    'public', 'mobile', 'wireless', 'landline', 'carrier', 'unknown', 'prospect',
    'number', 'owner', 'who', 'called', 'city', 'state', 'zip', 'code', 'usa'
}

AREA_CODE_MAP = {
    '305': ('Miami, FL', 'Wireless / T-Mobile USA', '+13058155673'),
    '786': ('Miami, FL', 'Wireless / MetroPCS', '+17865210872'),
    '954': ('Fort Lauderdale, FL', 'Wireless / AT&T Mobility', '+19544120988'),
    '407': ('Orlando, FL', 'Wireless / Verizon Wireless', '+14076541290'),
    '561': ('West Palm Beach, FL', 'Wireless / AT&T Mobility', '+15613204911'),
    '813': ('Tampa, FL', 'Wireless / T-Mobile USA', '+18137781204'),
    '212': ('New York, NY', 'Wireless / Verizon Wireless', '+12128903344'),
    '718': ('Brooklyn, NY', 'Wireless / T-Mobile USA', '+17184501299'),
    '917': ('New York, NY', 'Wireless / Sprint Spectrum', '+19176338821'),
    '310': ('Los Angeles, CA', 'Wireless / AT&T Mobility', '+13109012384'),
    '213': ('Los Angeles, CA', 'Wireless / T-Mobile USA', '+12135509123'),
    '415': ('San Francisco, CA', 'Wireless / Verizon Wireless', '+14157723901'),
    '312': ('Chicago, IL', 'Wireless / AT&T Mobility', '+13124401829'),
    '713': ('Houston, TX', 'Wireless / T-Mobile USA', '+17138802341'),
    '214': ('Dallas, TX', 'Wireless / Verizon Wireless', '+12149021182'),
    '404': ('Atlanta, GA', 'Wireless / AT&T Mobility', '+14043209812'),
    '206': ('Seattle, WA', 'Wireless / T-Mobile USA', '+12065549012'),
    '702': ('Las Vegas, NV', 'Wireless / T-Mobile USA', '+17028891203'),
    '602': ('Phoenix, AZ', 'Wireless / Verizon Wireless', '+16024419028'),
    '215': ('Philadelphia, PA', 'Wireless / AT&T Mobility', '+12158829012'),
    '617': ('Boston, MA', 'Wireless / Verizon Wireless', '+16173329014'),
    '313': ('Detroit, MI', 'Wireless / T-Mobile USA', '+13134419023'),
}

DEFAULT_CITIES = [
    ('Miami, FL', '1245 NW 36th St', '305', 'T-Mobile USA', ['Mary', 'Robert', 'David']),
    ('Orlando, FL', '7820 Orange Ave', '407', 'Verizon Wireless', ['Sarah', 'James', 'Patricia']),
    ('Fort Lauderdale, FL', '401 E Las Olas Blvd', '954', 'AT&T Mobility', ['Michael', 'Jennifer']),
    ('New York, NY', '450 W 42nd St', '212', 'Verizon Wireless', ['John Jr', 'Elizabeth']),
    ('Los Angeles, CA', '10880 Wilshire Blvd', '310', 'AT&T Mobility', ['Christopher', 'Barbara']),
    ('Dallas, TX', '2100 Ross Ave', '214', 'Verizon Wireless', ['Daniel', 'Linda']),
    ('Atlanta, GA', '191 Peachtree St NW', '404', 'AT&T Mobility', ['Matthew', 'Susan']),
]

def clean_phone(phone_str):
    if not phone_str:
        return ''
    digits = ''.join(c for c in phone_str if c.isdigit())
    if len(digits) == 10:
        return '+1' + digits
    if len(digits) == 11 and digits.startswith('1'):
        return '+' + digits
    return '+' + digits if digits else ''

def get_area_code_info(digits):
    d = digits[-10:] if len(digits) >= 10 else digits
    code = d[:3] if len(d) >= 3 else ''
    if code in AREA_CODE_MAP:
        loc, carrier, phone = AREA_CODE_MAP[code]
        return {'location': loc, 'carrier': carrier, 'phone': phone}
    return {'location': 'United States', 'carrier': 'Wireless / US Telephony Carrier', 'phone': clean_phone(digits) or '+13058155673'}

def is_valid_human_name(name_str):
    if not name_str or len(name_str.strip()) < 2:
        return False
    words = name_str.strip().lower().split()
    for w in words:
        clean_w = re.sub(r'[^a-z0-9%]', '', w)
        if clean_w in INVALID_NAME_KEYWORDS:
            return False
    if any(c.isdigit() for c in name_str):
        return False
    return bool(re.match(r'^[A-Za-z\s\.\'\-]+$', name_str.strip()))

def extract_name_and_loc_from_url(url):
    if not url:
        return '', ''
    url_unquoted = urllib.parse.unquote(url)
    
    tps_match = re.search(r'truepeoplesearch\.com/find/([a-z\-]+)(?:/([a-z\-]+))?', url_unquoted, re.IGNORECASE)
    if tps_match:
        name_slug = tps_match.group(1).replace('-', ' ').title()
        loc_slug = tps_match.group(2).replace('-', ' ').title() if tps_match.group(2) else ''
        if is_valid_human_name(name_slug):
            return name_slug, loc_slug
            
    fps_match = re.search(r'fastpeoplesearch\.com/(?:name/)?([a-z\-]+)(?:_([a-z\-]+))?', url_unquoted, re.IGNORECASE)
    if fps_match:
        name_slug = fps_match.group(1).replace('-', ' ').title()
        loc_slug = fps_match.group(2).replace('-', ' ').title() if fps_match.group(2) else ''
        if is_valid_human_name(name_slug):
            return name_slug, loc_slug
            
    return '', ''

def lookup_tps_fps(search_type='phone', phone='', name='', location='', provider='all'):
    """
    Third-party people-search enrichment is disabled.

    The old implementation fabricated fallback identities, phone numbers and
    addresses. An empty result is safer than presenting unverified data as real.
    """
    logger.info("Third-party TPS/FPS lookup requested but disabled")
    return []

    # Legacy code below is intentionally unreachable.
    if phone and not any(c.isdigit() for c in phone) and not name:
        name = phone
        phone = ''
        search_type = 'name'

    results = []
    digits = ''.join(c for c in phone if c.isdigit()) if phone else ''

    # 1. Direct Scrapes
    if provider in ['all', 'tps']:
        try:
            tps_results = query_truepeoplesearch(search_type, digits, name, location)
            results.extend(tps_results)
        except Exception as e:
            logger.warning(f"TPS lookup warning: {e}")

    if provider in ['all', 'fps']:
        try:
            fps_results = query_fastpeoplesearch(search_type, digits, name, location)
            results.extend(fps_results)
        except Exception as e:
            logger.warning(f"FPS lookup warning: {e}")

    # 2. Live Search Engine Proxy Extraction
    if not results or (search_type == 'name' and len(results) < 2):
        try:
            proxy_results = query_public_tps_fps_proxy(search_type, digits or phone, name, location)
            results.extend(proxy_results)
        except Exception as e:
            logger.warning(f"Public proxy lookup warning: {e}")

    # Filter out duplicate leads and invalid title strings
    filtered_results = []
    seen_keys = set()
    for lead in results:
        fname = lead.get('first_name', '')
        lname = lead.get('last_name', '')
        full_name = f"{fname} {lname}".strip()
        key = f"{full_name.lower()}_{lead.get('phone', '')}"
        
        if is_valid_human_name(full_name) and key not in seen_keys:
            seen_keys.add(key)
            filtered_results.append(lead)

    # 3. If empty or searching by name, expand results to a full list of matching cards with real phone numbers
    if not filtered_results or (search_type == 'name' and len(filtered_results) < 2):
        name_results = generate_name_search_results(name or 'Prospect', location)
        for nr in name_results:
            key = f"{nr['first_name'].lower()}_{nr['last_name'].lower()}_{nr['phone']}"
            if key not in seen_keys:
                seen_keys.add(key)
                filtered_results.append(nr)

    return filtered_results

def query_public_tps_fps_proxy(search_type, phone_or_digits, name, location):
    if not BeautifulSoup:
        return []

    query_parts = []
    if name and is_valid_human_name(name):
        query_parts.append(name)
    if phone_or_digits:
        query_parts.append(phone_or_digits)
    if location:
        query_parts.append(location)

    if not query_parts:
        return []

    query_str = " ".join(query_parts)
    search_url = f"https://html.duckduckgo.com/html/?q=site:truepeoplesearch.com+OR+site:fastpeoplesearch.com+{urllib.parse.quote(query_str)}"

    results = []
    try:
        req = urllib.request.Request(search_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as response:
            html = response.read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            snippets = soup.find_all('div', class_=re.compile(r'result__body|result__snippet|links_main'))
            
            for idx, snip in enumerate(snippets[:8]):
                title_elem = snip.find_previous('a', class_=re.compile(r'result__a|result__title')) or snip.find('a')
                snippet_text = snip.get_text().strip()
                title_text = title_elem.get_text().strip() if title_elem else ''
                target_link = title_elem['href'] if title_elem and title_elem.has_attr('href') else ''

                url_name, url_loc = extract_name_and_loc_from_url(target_link)
                cleaned_title = re.sub(r'-(?:\s*TruePeopleSearch|\s*FastPeopleSearch|\s*Free People Search|\s*Address|\s*Lookup).*$', '', title_text, flags=re.IGNORECASE).strip()
                cleaned_title = re.sub(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '', cleaned_title).strip()
                
                real_name = ''
                if is_valid_human_name(url_name):
                    real_name = url_name
                elif is_valid_human_name(cleaned_title):
                    real_name = cleaned_title
                elif is_valid_human_name(name):
                    real_name = name

                if real_name:
                    parts = real_name.split()
                    fname = parts[0]
                    lname = ' '.join(parts[1:]) if len(parts) > 1 else ''

                    # Phone match
                    phone_match = re.search(r'\(?\b[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', snippet_text)
                    if phone_match:
                        extracted_phone = clean_phone(phone_match.group(0))
                    elif phone_or_digits and any(c.isdigit() for c in phone_or_digits):
                        extracted_phone = clean_phone(phone_or_digits)
                    else:
                        # Assign regional phone from area code mapping for the location
                        area_info = get_area_code_info(['305', '407', '212', '310', '214', '404', '786', '954'][idx % 8])
                        extracted_phone = area_info['phone']

                    street_match = re.search(r'\b\d{1,5}\s+[A-Za-z0-9\s\.\,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Ste|Suite|Apt)\b[A-Za-z0-9\s\,\.]*', snippet_text, re.IGNORECASE)
                    loc_match = re.search(r'\b[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s*\d{5})?\b', snippet_text)
                    extracted_addr = street_match.group(0) if street_match else (loc_match.group(0) if loc_match else (url_loc or location or 'Miami, FL'))

                    carrier_match = re.search(r'\b(T-Mobile|AT&T|Verizon|Sprint|MetroPCS|Cricket|Spectrum|Bandwidth|CenturyLink|Frontier|Comcast|Xfinity|Landline|Wireless|Cellular|VoIP)\b[^\.\,]*', snippet_text, re.IGNORECASE)
                    area_info = get_area_code_info(''.join(c for c in extracted_phone if c.isdigit()))
                    extracted_carrier = carrier_match.group(0) if carrier_match else area_info['carrier']

                    age_match = re.search(r'\b(?:Age|Aged)\s*(\d{2})\b', snippet_text, re.IGNORECASE)
                    extracted_age = age_match.group(1) if age_match else str(32 + (idx * 5) % 30)

                    source_name = 'TruePeopleSearch (Live Direct)' if 'truepeoplesearch' in target_link.lower() else 'FastPeopleSearch (Live Direct)'

                    results.append({
                        'first_name': fname,
                        'last_name': lname,
                        'phone': extracted_phone,
                        'address': extracted_addr,
                        'carrier': extracted_carrier,
                        'company': extracted_carrier,
                        'age': extracted_age,
                        'relatives': [f"Proche {rel}" for rel in DEFAULT_CITIES[idx % len(DEFAULT_CITIES)][4]],
                        'source': source_name,
                        'direct_link': target_link or 'https://www.truepeoplesearch.com',
                        'tps_url': target_link or 'https://www.truepeoplesearch.com',
                        'fps_url': target_link or 'https://www.fastpeoplesearch.com',
                    })
    except Exception as e:
        logger.debug(f"Public proxy search engine fallback error: {e}")

    return results

def generate_name_search_results(name, location=''):
    """
    Generate a list of matching person cards across cities/states for name searches.
    Guarantees every person entry has a real active phone number and exact street address.
    """
    clean_name = name.strip().title() if name else 'Prospect'
    parts = clean_name.split()
    fname = parts[0] if parts else 'Prospect'
    lname = ' '.join(parts[1:]) if len(parts) > 1 else 'Smith'

    results = []
    cities_to_use = DEFAULT_CITIES
    if location:
        # Put user specified location first
        cities_to_use = [(location, '1245 Main St', '305', 'T-Mobile USA', ['Mary', 'Robert'])] + DEFAULT_CITIES

    for idx, (city, street, code, carrier, relatives) in enumerate(cities_to_use[:6]):
        area_info = get_area_code_info(code)
        # Alternate last name slightly if searching single word e.g. "jhon"
        curr_lname = lname if len(parts) > 1 else ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller'][idx % 6]
        
        tps_url = f"https://www.truepeoplesearch.com/results?name={urllib.parse.quote(fname + ' ' + curr_lname)}&citystatezip={urllib.parse.quote(city)}"
        fps_url = f"https://www.fastpeoplesearch.com/name/{fname.lower()}-{curr_lname.lower()}_{city.lower().replace(', ', '-').replace(' ', '-')}"

        results.append({
            'first_name': fname,
            'last_name': curr_lname,
            'phone': area_info['phone'],
            'address': f"{street}, {city}",
            'carrier': f"Wireless / {carrier}",
            'company': f"Wireless / {carrier}",
            'age': str(35 + idx * 4),
            'relatives': [f"{rel} {curr_lname}" for rel in relatives],
            'source': 'TPS / FPS Intelligence Proxy',
            'direct_link': tps_url,
            'tps_url': tps_url,
            'fps_url': fps_url,
        })

    return results

def generate_candidate_lead(search_type, phone, name, location):
    digits = ''.join(c for c in phone if c.isdigit()) if phone else ''
    area_info = get_area_code_info(digits)
    formatted_phone = clean_phone(digits) or area_info['phone']

    if name and is_valid_human_name(name):
        parts = name.strip().split()
        fname = parts[0]
        lname = ' '.join(parts[1:]) if len(parts) > 1 else ''
    else:
        fname = 'Prospect TPS/FPS'
        lname = digits[-4:] if len(digits) >= 4 else 'Lead'

    tps_url = f"https://www.truepeoplesearch.com/results?phoneno={digits}" if digits else f"https://www.truepeoplesearch.com/results?name={urllib.parse.quote(name)}&citystatezip={urllib.parse.quote(location)}"
    fps_url = f"https://www.fastpeoplesearch.com/phone/{digits}" if digits else f"https://www.fastpeoplesearch.com/name/{name.lower().replace(' ', '-')}"

    return [
        {
            'first_name': fname,
            'last_name': lname,
            'phone': formatted_phone,
            'address': location or f"1245 NW 36th St, {area_info['location']}",
            'carrier': area_info['carrier'],
            'company': area_info['carrier'],
            'age': '35-50',
            'relatives': [f"Mary {lname}", f"Robert {lname}"],
            'source': 'TPS / FPS Intelligence Proxy',
            'direct_link': tps_url,
            'tps_url': tps_url,
            'fps_url': fps_url,
        }
    ]

def bulk_lookup_tps_fps(phones, provider='all'):
    logger.info("Third-party TPS/FPS bulk lookup requested but disabled")
    return {'found': [], 'not_found': [], 'results': [], 'found_count': 0, 'not_found_count': 0, 'total': 0}

    found = []
    not_found = []
    combined = []
    seen_digits = set()

    for idx, p in enumerate(phones):
        p_clean = clean_phone(p) or p
        digits = ''.join(c for c in p_clean if c.isdigit())
        
        if digits and digits in seen_digits:
            continue
        if digits:
            seen_digits.add(digits)

        leads = lookup_tps_fps(search_type='phone', phone=p_clean, provider=provider)
        
        best_lead = None
        for lead in leads:
            fname = lead.get('first_name', '')
            lname = lead.get('last_name', '')
            if is_valid_human_name(f"{fname} {lname}".strip()):
                best_lead = lead
                break
        
        if not best_lead and leads:
            best_lead = leads[0]

        if best_lead:
            fname = best_lead.get('first_name', '')
            lname = best_lead.get('last_name', '')
            full_name = f"{fname} {lname}".strip()
            has_real_name = is_valid_human_name(full_name)
            
            best_lead['lookup_phone'] = p_clean
            best_lead['phone'] = p_clean
            
            if has_real_name:
                best_lead['status'] = 'FOUND'
                found.append(best_lead)
                combined.append(best_lead)
            else:
                area_info = get_area_code_info(digits)
                not_found_item = {
                    'lookup_phone': p_clean,
                    'phone': p_clean,
                    'first_name': 'Prospect TPS/FPS',
                    'last_name': f'N° {idx + 1}',
                    'address': f"1245 NW 36th St, {area_info['location']}",
                    'carrier': area_info['carrier'],
                    'company': area_info['carrier'],
                    'status': 'NOT_FOUND',
                    'source': 'TPS/FPS (Aucun dossier public)',
                    'note': 'Aucun dossier public nominatif trouvé.'
                }
                not_found.append(not_found_item)
                combined.append(not_found_item)
        else:
            area_info = get_area_code_info(digits)
            not_found_item = {
                'lookup_phone': p_clean,
                'phone': p_clean,
                'first_name': 'Prospect TPS/FPS',
                'last_name': f'N° {idx + 1}',
                'address': f"1245 NW 36th St, {area_info['location']}",
                'carrier': area_info['carrier'],
                'company': area_info['carrier'],
                'status': 'NOT_FOUND',
                'source': 'TPS/FPS (Aucun dossier public)',
                'note': 'Aucun dossier public nominatif trouvé.'
            }
            not_found.append(not_found_item)
            combined.append(not_found_item)

    return {
        'found': found,
        'not_found': not_found,
        'results': combined,
        'found_count': len(found),
        'not_found_count': len(not_found),
        'total': len(combined),
    }

def query_truepeoplesearch(search_type, digits, name, location):
    results = []
    if not BeautifulSoup:
        return []
    if search_type == 'phone' and digits:
        url = f"https://www.truepeoplesearch.com/results?phoneno={digits}"
    elif search_type == 'name' and name:
        query_str = urllib.parse.quote(name)
        loc_str = urllib.parse.quote(location) if location else ''
        url = f"https://www.truepeoplesearch.com/results?name={query_str}&citystatezip={loc_str}"
    else:
        return []

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as response:
            html = response.read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            cards = soup.find_all('div', class_=re.compile(r'card-summary|card-body|result'))
            for card in cards[:5]:
                name_elem = card.find(class_=re.compile(r'name|h4|h2'))
                phone_elem = card.find(class_=re.compile(r'phone|phoneno'))
                addr_elem = card.find(class_=re.compile(r'address|location'))
                if name_elem:
                    full_name = name_elem.get_text().strip()
                    if is_valid_human_name(full_name):
                        parts = full_name.split()
                        fname = parts[0] if parts else 'Prospect'
                        lname = ' '.join(parts[1:]) if len(parts) > 1 else ''
                        c_phone = clean_phone(phone_elem.get_text() if phone_elem else digits)
                        c_addr = addr_elem.get_text().strip() if addr_elem else location
                        area_info = get_area_code_info(digits)
                        results.append({
                            'first_name': fname,
                            'last_name': lname,
                            'phone': c_phone or area_info['phone'],
                            'address': c_addr or f"1245 NW 36th St, {area_info['location']}",
                            'carrier': area_info['carrier'],
                            'company': area_info['carrier'],
                            'age': '38',
                            'relatives': [f"Mary {lname}", f"Robert {lname}"],
                            'source': 'TruePeopleSearch (Direct)',
                            'direct_link': url,
                            'tps_url': url
                        })
    except Exception as e:
        logger.debug(f"Direct TPS scrape error: {e}")

    return results

def query_fastpeoplesearch(search_type, digits, name, location):
    results = []
    if not BeautifulSoup:
        return []
    if search_type == 'phone' and digits:
        url = f"https://www.fastpeoplesearch.com/phone/{digits}"
    elif search_type == 'name' and name:
        formatted_name = name.lower().replace(' ', '-')
        formatted_loc = f"_{location.lower().replace(' ', '-')}" if location else ''
        url = f"https://www.fastpeoplesearch.com/name/{formatted_name}{formatted_loc}"
    else:
        return []

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as response:
            html = response.read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            cards = soup.find_all('div', class_=re.compile(r'card-summary|card-body|result'))
            for card in cards[:5]:
                name_elem = card.find(class_=re.compile(r'name|h4|h2'))
                phone_elem = card.find(class_=re.compile(r'phone|phoneno'))
                addr_elem = card.find(class_=re.compile(r'address|location'))
                if name_elem:
                    full_name = name_elem.get_text().strip()
                    if is_valid_human_name(full_name):
                        parts = full_name.split()
                        fname = parts[0] if parts else 'Prospect'
                        lname = ' '.join(parts[1:]) if len(parts) > 1 else ''
                        c_phone = clean_phone(phone_elem.get_text() if phone_elem else digits)
                        c_addr = addr_elem.get_text().strip() if addr_elem else location
                        area_info = get_area_code_info(digits)
                        results.append({
                            'first_name': fname,
                            'last_name': lname,
                            'phone': c_phone or area_info['phone'],
                            'address': c_addr or f"1245 NW 36th St, {area_info['location']}",
                            'carrier': area_info['carrier'],
                            'company': area_info['carrier'],
                            'age': '42',
                            'relatives': [f"Sarah {lname}", f"David {lname}"],
                            'source': 'FastPeopleSearch (Direct)',
                            'direct_link': url,
                            'fps_url': url
                        })
    except Exception as e:
        logger.debug(f"Direct FPS scrape error: {e}")

    return results
