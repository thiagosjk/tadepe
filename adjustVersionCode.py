#!/usr/bin/env python

from lxml import etree

lines = ''
with open('config.xml','r') as configFile:
    for line in configFile.readlines():
        lines += line

configXML = etree.fromstring(lines)

versionNumber = configXML.attrib['version']
versionCode = versionNumber.replace('.','')

if len(versionCode) < 6:
    versionCode += '0'

print versionNumber,versionCode


lines = ''
with open('./platforms/android/AndroidManifest.xml','r') as configFile:
    for line in configFile.readlines():
        lines += line

androidManifestXML = etree.fromstring(lines)

wrongVersion = androidManifestXML.attrib['{http://schemas.android.com/apk/res/android}versionCode']

replaceString = 'android:versionCode="'+str(wrongVersion)+'"'
replaceWith = 'android:versionCode="'+str(versionCode)+'"'

lines = ''
with open('./platforms/android/AndroidManifest.xml','r') as configFile:
    for line in configFile.readlines():
        lines += line.replace(replaceString,replaceWith)


with open('./platforms/android/AndroidManifest.xml','w') as configFile:
    for line in lines:
        configFile.write(line)