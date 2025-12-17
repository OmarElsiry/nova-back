import requests
import json

url = "https://channelsseller.site/api/user/udbcwicnovewwobvo/nfts"
headers = {"X-Admin-Password": "nova_admin_2024"}

try:
    response = requests.get(url, headers=headers, timeout=10)
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(e)
