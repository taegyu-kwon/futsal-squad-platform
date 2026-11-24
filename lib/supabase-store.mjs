import {createClient} from '@supabase/supabase-js';
export function createStore(env){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.TEAM_ADMIN_EMAIL||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Migration configuration is incomplete');
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const bucket=client.storage.from(env.SUPABASE_MEDIA_BUCKET||'team-media');
 const checked=({data,error})=>{if(error)throw error;return data;};
 return {
  async read(){return checked(await client.from('shared_team').select('*').eq('id','team').maybeSingle());},
  async save(snapshot,expectedRevision,userId){
   const row={snapshot,revision:expectedRevision+1,updated_at:new Date().toISOString(),updated_by:userId};
   const result=expectedRevision===0
    ?await client.from('shared_team').insert({id:'team',...row}).select()
    :await client.from('shared_team').update(row).eq('id','team').eq('revision',expectedRevision).select();
   if(result.error?.code==='23505')return null;
   const rows=checked(result);return rows?.[0]||null;
  },
  async user(token){const {data,error}=await client.auth.getUser(token);return error?null:data.user;},
  async signIn(email,password){const auth=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await auth.auth.signInWithPassword({email,password});return error?null:data;},
  async refresh(refresh_token){const auth=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await auth.auth.refreshSession({refresh_token});return error?null:data;},
  async signOut(token){await client.auth.admin.signOut(token,'local');},
  async signUpload(hash){return checked(await bucket.createSignedUploadUrl('media/'+hash));},
  async download(hash){const {data,error}=await bucket.download('media/'+hash);if(error&&['404','400'].includes(String(error.statusCode)))return null;return checked({data,error});},
  async mediaUrl(hash){const {data,error}=await bucket.createSignedUrl('media/'+hash,300);return error?null:data.signedUrl;}
 };
}
