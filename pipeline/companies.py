# Candidate target accounts: US-centric B2B software companies with commissioned sales teams.
# Each entry lists slug guesses; discover_boards.sql probes Greenhouse, Ashby and Lever for
# every guess and keeps the board with the most open roles that names the company.
# Format: name | domain | category | extra slug candidates (comma separated)
RAW = """
Datadog|datadoghq.com|DevOps & infra|datadog
MongoDB|mongodb.com|Data infra|mongodb
Elastic|elastic.co|Data infra|elastic
GitLab|gitlab.com|DevOps & infra|gitlab
Confluent|confluent.io|Data infra|confluent
Cloudflare|cloudflare.com|DevOps & infra|cloudflare
Fastly|fastly.com|DevOps & infra|fastly
Twilio|twilio.com|Comms & CX|twilio
PagerDuty|pagerduty.com|DevOps & infra|pagerduty
New Relic|newrelic.com|DevOps & infra|newrelic
Sumo Logic|sumologic.com|DevOps & infra|sumologic
Grafana Labs|grafana.com|DevOps & infra|grafanalabs
Sentry|sentry.io|DevOps & infra|sentry
LaunchDarkly|launchdarkly.com|DevOps & infra|launchdarkly
Kong|konghq.com|DevOps & infra|kong,konghq
Temporal|temporal.io|DevOps & infra|temporal,temporaltechnologies
Vercel|vercel.com|DevOps & infra|vercel
Netlify|netlify.com|DevOps & infra|netlify
Supabase|supabase.com|DevOps & infra|supabase
Retool|retool.com|DevOps & infra|retool
Airbyte|airbyte.com|Data infra|airbyte
Fivetran|fivetran.com|Data infra|fivetran
dbt Labs|getdbt.com|Data infra|dbtlabs,dbtlabsinc
Hightouch|hightouch.com|Data infra|hightouch
Astronomer|astronomer.io|Data infra|astronomer
Cockroach Labs|cockroachlabs.com|Data infra|cockroachlabs
Redis|redis.io|Data infra|redis,redislabs
Couchbase|couchbase.com|Data infra|couchbase
SingleStore|singlestore.com|Data infra|singlestore
Neo4j|neo4j.com|Data infra|neo4j
Pinecone|pinecone.io|Data infra|pinecone
ClickHouse|clickhouse.com|Data infra|clickhouse
MotherDuck|motherduck.com|Data infra|motherduck
Databricks|databricks.com|Data infra|databricks
Sigma Computing|sigmacomputing.com|Analytics|sigmacomputing,sigma
ThoughtSpot|thoughtspot.com|Analytics|thoughtspot
Hex|hex.tech|Analytics|hex,hextechnologies
Amplitude|amplitude.com|Analytics|amplitude
Mixpanel|mixpanel.com|Analytics|mixpanel
FullStory|fullstory.com|Analytics|fullstory
Pendo|pendo.io|Analytics|pendo
LogRocket|logrocket.com|Analytics|logrocket
Braze|braze.com|Martech|braze
Iterable|iterable.com|Martech|iterable
Customer.io|customer.io|Martech|customerio
Klaviyo|klaviyo.com|Martech|klaviyo
Attentive|attentive.com|Martech|attentive,attentivemobile
Optimizely|optimizely.com|Martech|optimizely
Contentful|contentful.com|Martech|contentful
Sanity|sanity.io|Martech|sanity
Webflow|webflow.com|Martech|webflow
Framer|framer.com|Martech|framer
Figma|figma.com|Collaboration|figma
Miro|miro.com|Collaboration|miro,realtimeboardglobal
Airtable|airtable.com|Collaboration|airtable
Asana|asana.com|Collaboration|asana
ClickUp|clickup.com|Collaboration|clickup
Smartsheet|smartsheet.com|Collaboration|smartsheet
Coda|coda.io|Collaboration|coda
Calendly|calendly.com|Collaboration|calendly
Zapier|zapier.com|Automation|zapier
Workato|workato.com|Automation|workato
Tray.ai|tray.ai|Automation|trayio,trayai
Celigo|celigo.com|Automation|celigo
Boomi|boomi.com|Automation|boomi,boomilp
CrowdStrike|crowdstrike.com|Security|crowdstrike
Okta|okta.com|Security|okta
SentinelOne|sentinelone.com|Security|sentinelone,sentinellabs
Wiz|wiz.io|Security|wiz,wizinc
Snyk|snyk.io|Security|snyk
Vanta|vanta.com|Security|vanta
Drata|drata.com|Security|drata
Secureframe|secureframe.com|Security|secureframe
OneTrust|onetrust.com|Security|onetrust
1Password|1password.com|Security|1password,agilebits
Tailscale|tailscale.com|Security|tailscale
Abnormal Security|abnormalsecurity.com|Security|abnormalsecurity,abnormal
Arctic Wolf|arcticwolf.com|Security|arcticwolf,arcticwolfnetworks
Huntress|huntress.com|Security|huntress,huntresslabs
Rapid7|rapid7.com|Security|rapid7
Tenable|tenable.com|Security|tenable
Netskope|netskope.com|Security|netskope
Illumio|illumio.com|Security|illumio
Island|island.io|Security|island,islandio
Cyera|cyera.io|Security|cyera
Chainguard|chainguard.dev|Security|chainguard
Socure|socure.com|Security|socure
Persona|withpersona.com|Security|persona,withpersona
Coalition|coalitioninc.com|Security|coalition,coalitioninc
Expel|expel.com|Security|expel
Red Canary|redcanary.com|Security|redcanary
Material Security|material.security|Security|materialsecurity
Tines|tines.com|Security|tines
Semgrep|semgrep.dev|Security|semgrep,r2c
Orca Security|orca.security|Security|orcasecurity,orca
Axonius|axonius.com|Security|axonius
KnowBe4|knowbe4.com|Security|knowbe4
Rubrik|rubrik.com|Security|rubrik
Cohesity|cohesity.com|Security|cohesity
Druva|druva.com|Security|druva
Keeper Security|keepersecurity.com|Security|keepersecurity,keeper
Gong|gong.io|Sales tech|gong,gongio
Outreach|outreach.io|Sales tech|outreach,outreachio
Salesloft|salesloft.com|Sales tech|salesloft
Clari|clari.com|Sales tech|clari
Seismic|seismic.com|Sales tech|seismic
Highspot|highspot.com|Sales tech|highspot
ZoomInfo|zoominfo.com|Sales tech|zoominfo
6sense|6sense.com|Sales tech|6sense,6senseinsights
Demandbase|demandbase.com|Sales tech|demandbase
Apollo.io|apollo.io|Sales tech|apollo,apolloio
Clay|clay.com|Sales tech|clay,claylabs
Common Room|commonroom.io|Sales tech|commonroom
People.ai|people.ai|Sales tech|peopleai
Chili Piper|chilipiper.com|Sales tech|chilipiper
Qualified|qualified.com|Sales tech|qualified
Gainsight|gainsight.com|Sales tech|gainsight
ChurnZero|churnzero.com|Sales tech|churnzero
Vitally|vitally.io|Sales tech|vitally
Mutiny|mutinyhq.com|Sales tech|mutiny
G2|g2.com|Sales tech|g2,g2crowd
Hootsuite|hootsuite.com|Martech|hootsuite
Sprinklr|sprinklr.com|Martech|sprinklr
Yext|yext.com|Martech|yext
Semrush|semrush.com|Martech|semrush
Similarweb|similarweb.com|Martech|similarweb
Writer|writer.com|AI|writer
Grammarly|grammarly.com|AI|grammarly
Lusha|lusha.com|Sales tech|lusha
Cognism|cognism.com|Sales tech|cognism
Mindtickle|mindtickle.com|Sales tech|mindtickle
Allego|allego.com|Sales tech|allego
Showpad|showpad.com|Sales tech|showpad
PandaDoc|pandadoc.com|Sales tech|pandadoc
Ironclad|ironcladapp.com|Legal tech|ironclad,ironcladhq
Juro|juro.com|Legal tech|juro
DealHub|dealhub.io|Sales tech|dealhub
Maxio|maxio.com|Fintech|maxio
Recurly|recurly.com|Fintech|recurly
Paddle|paddle.com|Fintech|paddle
Stripe|stripe.com|Fintech|stripe
Metronome|metronome.com|Fintech|metronome
Orb|withorb.com|Fintech|orb,withorb
Rippling|rippling.com|HR tech|rippling
Gusto|gusto.com|HR tech|gusto
Deel|deel.com|HR tech|deel
Remote|remote.com|HR tech|remote,remotecom
Lattice|lattice.com|HR tech|lattice
Culture Amp|cultureamp.com|HR tech|cultureamp
15Five|15five.com|HR tech|15five
Leapsome|leapsome.com|HR tech|leapsome
BambooHR|bamboohr.com|HR tech|bamboohr
HiBob|hibob.com|HR tech|hibob,bob
Justworks|justworks.com|HR tech|justworks
Greenhouse|greenhouse.com|HR tech|greenhouse
Gem|gem.com|HR tech|gem
Checkr|checkr.com|HR tech|checkr
Carta|carta.com|Fintech|carta
Pulley|pulley.com|Fintech|pulley
Brex|brex.com|Fintech|brex
Ramp|ramp.com|Fintech|ramp
Mercury|mercury.com|Fintech|mercury
Navan|navan.com|Fintech|navan,tripactions
Expensify|expensify.com|Fintech|expensify
BILL|bill.com|Fintech|billcom,bill
Tipalti|tipalti.com|Fintech|tipalti
Stampli|stampli.com|Fintech|stampli
Zip|ziphq.com|Fintech|zip,ziphq
Vendr|vendr.com|Fintech|vendr
Tropic|tropicapp.io|Fintech|tropic
Modern Treasury|moderntreasury.com|Fintech|moderntreasury
Plaid|plaid.com|Fintech|plaid
Alloy|alloy.com|Fintech|alloy
Unit|unit.co|Fintech|unit,unitfinance
Marqeta|marqeta.com|Fintech|marqeta
Affirm|affirm.com|Fintech|affirm
Bolt|bolt.com|Fintech|bolt
Checkout.com|checkout.com|Fintech|checkoutcom,checkout
Toast|toasttab.com|Vertical SaaS|toast
Samsara|samsara.com|Vertical SaaS|samsara
Motive|gomotive.com|Vertical SaaS|motive,gomotive,keeptruckin
ServiceTitan|servicetitan.com|Vertical SaaS|servicetitan
Procore|procore.com|Vertical SaaS|procore,procoretechnologies
Flexport|flexport.com|Vertical SaaS|flexport
project44|project44.com|Vertical SaaS|project44
FourKites|fourkites.com|Vertical SaaS|fourkites
Faire|faire.com|Vertical SaaS|faire
Gorgias|gorgias.com|Comms & CX|gorgias
Yotpo|yotpo.com|Martech|yotpo
Intercom|intercom.com|Comms & CX|intercom
Front|front.com|Comms & CX|front,frontapp
Dialpad|dialpad.com|Comms & CX|dialpad
Aircall|aircall.io|Comms & CX|aircall
Talkdesk|talkdesk.com|Comms & CX|talkdesk
Zendesk|zendesk.com|Comms & CX|zendesk
Qualtrics|qualtrics.com|Comms & CX|qualtrics
Typeform|typeform.com|Martech|typeform
Productboard|productboard.com|Collaboration|productboard
Dovetail|dovetail.com|Collaboration|dovetail
Celonis|celonis.com|Automation|celonis
UiPath|uipath.com|Automation|uipath
Box|box.com|Collaboration|box,boxinc
Dropbox|dropbox.com|Collaboration|dropbox
Egnyte|egnyte.com|Collaboration|egnyte
Canva|canva.com|Collaboration|canva
Linear|linear.app|Collaboration|linear
Attio|attio.com|Sales tech|attio
Scale AI|scale.com|AI|scaleai,scale
Cohere|cohere.com|AI|cohere
Anthropic|anthropic.com|AI|anthropic
OpenAI|openai.com|AI|openai
Hebbia|hebbia.ai|AI|hebbia
Harvey|harvey.ai|AI|harvey
Sierra|sierra.ai|AI|sierra
Decagon|decagon.ai|AI|decagon
Cresta|cresta.com|AI|cresta
Moveworks|moveworks.com|AI|moveworks
Weights & Biases|wandb.ai|AI|wandb,weightsandbiases
Together AI|together.ai|AI|togetherai,together
Fireworks AI|fireworks.ai|AI|fireworksai
Baseten|baseten.co|AI|baseten
Modal|modal.com|AI|modal,modallabs
Replit|replit.com|AI|replit
Cursor|cursor.com|AI|anysphere,cursor
Cognition|cognition.ai|AI|cognition
ElevenLabs|elevenlabs.io|AI|elevenlabs
Synthesia|synthesia.io|AI|synthesia
Descript|descript.com|AI|descript
Runway|runwayml.com|AI|runway,runwayml
Otter.ai|otter.ai|AI|otterai,otter
Hugging Face|huggingface.co|AI|huggingface
Glean|glean.com|AI|glean,gleanwork
Perplexity|perplexity.ai|AI|perplexity,perplexityai
Notion|notion.so|Collaboration|notion
Postman|postman.com|DevOps & infra|postman
Zuora|zuora.com|Fintech|zuora
Chargebee|chargebee.com|Fintech|chargebee
Diligent|diligent.com|Legal tech|diligent,diligentcorporation
Sprout Social|sproutsocial.com|Martech|sproutsocial
HackerRank|hackerrank.com|HR tech|hackerrank
Starburst|starburst.io|Data infra|starburst,starburstdata
Jasper|jasper.ai|AI|jasper,jasperai
Tebra|tebra.com|Vertical SaaS|tebra
PayJoy|payjoy.com|Fintech|payjoy
Unity|unity.com|DevOps & infra|unity,unity3d
Benchling|benchling.com|Vertical SaaS|benchling
Veeva|veeva.com|Vertical SaaS|veeva
Zocdoc|zocdoc.com|Vertical SaaS|zocdoc
Abridge|abridge.com|AI|abridge
Datavant|datavant.com|Vertical SaaS|datavant
Komodo Health|komodohealth.com|Vertical SaaS|komodohealth
Innovaccer|innovaccer.com|Vertical SaaS|innovaccer
Gamma|gamma.app|AI|gamma
Hopper|hopper.com|Vertical SaaS|hopper
Iterable|iterable.com|Martech|iterable
Monte Carlo|montecarlodata.com|Data infra|montecarlodata
Atlan|atlan.com|Data infra|atlan
Alation|alation.com|Data infra|alation
Collibra|collibra.com|Data infra|collibra
Dremio|dremio.com|Data infra|dremio
Cribl|cribl.io|DevOps & infra|cribl
Harness|harness.io|DevOps & infra|harness,harnessinc
CircleCI|circleci.com|DevOps & infra|circleci
JFrog|jfrog.com|DevOps & infra|jfrog
Chronosphere|chronosphere.io|DevOps & infra|chronosphere
Honeycomb|honeycomb.io|DevOps & infra|honeycomb
Teleport|goteleport.com|Security|teleport,gravitational
Doppler|doppler.com|Security|doppler
Okta Auth0|auth0.com|Security|auth0
Stytch|stytch.com|Security|stytch
WorkOS|workos.com|DevOps & infra|workos
Clerk|clerk.com|DevOps & infra|clerk
Algolia|algolia.com|DevOps & infra|algolia
Mux|mux.com|DevOps & infra|mux
Sendbird|sendbird.com|Comms & CX|sendbird
Braintrust|braintrust.dev|AI|braintrust,braintrustdata
Arize AI|arize.com|AI|arizeai,arize
Snorkel AI|snorkel.ai|AI|snorkelai
Writer|writer.com|AI|writer
Rippling|rippling.com|HR tech|rippling
Navattic|navattic.com|Sales tech|navattic
Gainsight|gainsight.com|Sales tech|gainsight
Seamless.AI|seamless.ai|Sales tech|seamlessai
Momentum|momentum.io|Sales tech|momentum
Unify|unifygtm.com|Sales tech|unify,unifygtm
Docebo|docebo.com|HR tech|docebo
Workramp|workramp.com|HR tech|workramp
Loopio|loopio.com|Sales tech|loopio
Responsive|responsive.io|Sales tech|responsive,rfpio
Conga|conga.com|Sales tech|conga
Avalara|avalara.com|Fintech|avalara
Anrok|anrok.com|Fintech|anrok
Rillet|rillet.com|Fintech|rillet
Puzzle|puzzle.io|Fintech|puzzle
Mosaic|mosaic.tech|Fintech|mosaic,mosaictech
Pigment|pigment.com|Fintech|pigment
Cube|cubesoftware.com|Fintech|cube,cubesoftware
Runway Financial|runway.com|Fintech|runwayfinancial
Abacum|abacum.ai|Fintech|abacum
Planful|planful.com|Fintech|planful
Vena|venasolutions.com|Fintech|vena,venasolutions
Datarails|datarails.com|Fintech|datarails
Fullcast|fullcast.com|Sales tech|fullcast
"""

# Vendors in the category itself are never targeted.
COMPETITORS = {"captivateiq","xactly","varicent","quotapath","spiff","performio","qobra","forma.ai","salesforce","sap","oracle","anaplan"}

# Existing customers come from the CRM in a real deployment; the demo treats everyone as a prospect.
CUSTOMERS: set[str] = set()

def norm(s):
    import re
    return re.sub(r'[^a-z0-9]', '', s.lower())

def rows():
    seen = set()
    out = []
    for line in RAW.strip().splitlines():
        name, domain, cat, extra = [p.strip() for p in line.split('|')]
        if domain in seen:
            continue
        seen.add(domain)
        slugs = [s.strip() for s in extra.split(',') if s.strip()]
        base = norm(name)
        if base not in slugs:
            slugs.append(base)
        out.append(dict(name=name, domain=domain, category=cat, slugs=slugs,
                        crm_status='customer' if domain in CUSTOMERS else 'prospect'))
    return out

if __name__ == '__main__':
    import json, sys
    r = rows()
    print(len(r), 'companies', sum(len(x['slugs']) for x in r), 'slug candidates', file=sys.stderr)
    json.dump(r, open(sys.argv[1] if len(sys.argv) > 1 else 'companies.json', 'w'), indent=1)
