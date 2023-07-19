from firebase import firebase
import json

import firebase_admin

f = open('secrets.json')
data = json.load(f)

print(data)

# auth = firebase.FirebaseAuthentication(data["apiKey"], "")

# firebase = firebase.FirebaseApplication(data["databaseURL"], authentication=auth)

# print(firebase)

cred_obj = firebase_admin.credentials.Certificate(data)
default_app = firebase_admin.initialize_app(cred_obj, {
	'databaseURL': data["databaseURL"]
	})

print(default_app)