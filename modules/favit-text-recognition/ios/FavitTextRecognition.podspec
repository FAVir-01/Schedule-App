Pod::Spec.new do |s|
  s.name = 'FavitTextRecognition'
  s.version = '1.0.0'
  s.summary = 'On-device text recognition for Favit'
  s.description = 'Recognizes text in a local image without uploading it.'
  s.author = ''
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end

