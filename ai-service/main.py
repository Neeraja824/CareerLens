import os

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
app = FastAPI(title='CareerLens AI Service', version='0.1.0')


@app.get('/health')
def health_check():
    return {'success': True, 'message': 'CareerLens AI service is running'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), reload=True)
