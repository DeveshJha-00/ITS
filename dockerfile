FROM python:3.11

WORKDIR /app

# Copy requirements
COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy database (optional)
COPY parksmart.db /app/parksmart.db

# Set environment variable for Flask
ENV FLASK_APP=app:create_app
ENV FLASK_ENV=development

EXPOSE 5000

# Run Flask app
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]